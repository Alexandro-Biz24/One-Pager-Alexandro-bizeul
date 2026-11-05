
"""RTE + LightGBM training utilities.

Target: observed load - frozen RTE D+1 forecast.
Model input: eight directly named Neon features.
Training, tuning and calibration are orchestrated by the notebook.
"""

from pathlib import Path
from datetime import date
import os

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd

from timeseries.pipeline.store import connect

FEATURES = [
    "target_hour",
    "target_day_of_week",
    "target_month",
    "prediction_d1",
    "rte_error_lag_48h",
    "hdd_48h",
    "cdd_48h",
    "calendar_amplify_ewa",
]

TARGET = "rte_residual"
ALPHA = 0.05

ARTIFACT = (
    Path(__file__).resolve().parent
    / "artifacts"
    / "lightgbm_model.joblib"
)


def french_midnight(day):
    """Convert a French calendar date to a UTC timestamp."""
    return pd.Timestamp(day, tz="Europe/Paris").tz_convert("UTC")


def read_dataset(start_day: date, end_day: date):
    """Read [start_day, end_day) in French local calendar time."""

    start = french_midnight(start_day)
    end = french_midnight(end_day)

    cols = ["utc", "load", *FEATURES]
    sql = f"""
        SELECT {", ".join(cols)}
        FROM hourly_data
        WHERE utc >= %s AND utc < %s
        ORDER BY utc
    """

    with connect() as db:
        rows = db.execute(
            sql,
            (start.to_pydatetime(), end.to_pydatetime()),
        ).fetchall()

    if not rows:
        raise RuntimeError("No rows found in hourly_data.")

    df = pd.DataFrame(rows, columns=cols)
    df["utc"] = pd.to_datetime(df["utc"], utc=True)
    df = df.set_index("utc").sort_index()

    if not df.index.is_unique:
        raise RuntimeError("Duplicate UTC timestamps.")

    # Match the project's DST convention:
    # remove the first occurrence of the repeated autumn 02:00.
    local_clock = df.index.tz_convert(
        "Europe/Paris"
    ).tz_localize(None)

    df = df.loc[
        ~local_clock.duplicated(keep="last")
    ].copy()

    # The residual target is known only when actual load is available.
    df[TARGET] = df["load"] - df["prediction_d1"]

    return df


def complete_rows(df, require_target=True, min_ratio=0.95):
    """Select complete rows and reject excessively incomplete datasets."""

    required = FEATURES + ([TARGET] if require_target else [])

    data = df.dropna(subset=required).copy()

    for col in required:
        data[col] = pd.to_numeric(data[col], errors="raise")

    finite = np.isfinite(data[required].to_numpy(dtype=float)).all(axis=1)
    data = data.loc[finite]

    ratio = len(data) / len(df) if len(df) else 0

    if ratio < min_ratio:
        raise RuntimeError(
            f"Only {ratio:.1%} of rows are complete. "
            "Check the historical feature-engineering pipeline."
        )

    if data.empty:
        raise RuntimeError("No complete LightGBM observations.")

    return data


def fit_lightgbm(train_df, params):
    """Fit the RTE residual correction model."""

    train = complete_rows(train_df)

    model = lgb.LGBMRegressor(**params)
    model.fit(train[FEATURES], train[TARGET])

    return model


def predict_load(model, data):
    """Reconstruct consumption from the RTE baseline + correction."""

    if data[FEATURES].isna().any().any():
        raise RuntimeError("Incomplete LightGBM input features.")

    correction = model.predict(data[FEATURES])

    return pd.Series(
        data["prediction_d1"].to_numpy(dtype=float) + correction,
        index=data.index,
        name="prediction_mw",
    )


def conformal_quantile(errors, alpha=ALPHA):
    """Finite-sample corrected absolute-error quantile."""

    values = np.sort(np.asarray(errors, dtype=float))
    values = values[np.isfinite(values)]

    n = len(values)

    if n == 0:
        raise RuntimeError("Empty conformal calibration group.")

    rank = int(np.ceil((n + 1) * (1 - alpha)))

    if rank > n:
        raise RuntimeError(
            "Insufficient calibration observations "
            "for the requested coverage."
        )

    return float(values[rank - 1])


def calibrate_hourly(model, calibration_df, alpha=ALPHA):
    """Calibrate one absolute-error margin per French local hour."""

    cal = complete_rows(calibration_df)

    prediction = predict_load(model, cal)
    errors = (cal["load"] - prediction).abs()

    hours = cal.index.tz_convert("Europe/Paris").hour

    margins = (
        pd.DataFrame({
            "hour": hours,
            "absolute_error": errors.to_numpy(),
        })
        .groupby("hour")["absolute_error"]
        .apply(lambda x: conformal_quantile(x, alpha))
    )

    if set(margins.index) != set(range(24)):
        raise RuntimeError("Missing French hours in calibration.")

    return {int(hour): float(value) for hour, value in margins.items()}


def save_artifact(
    model,
    margins,
    params,
    train_start,
    train_end,
    cal_start,
    cal_end,
    path=ARTIFACT,
):
    """Atomically persist the fitted model and conformal margins."""

    if sorted(margins) != list(range(24)):
        raise RuntimeError("Expected 24 hourly conformal margins.")

    if not (train_start < train_end <= cal_start < cal_end):
        raise ValueError("Training and calibration periods overlap.")

    artifact = {
        "model": model,
        "features": list(FEATURES),
        "params": dict(params),
        "margins": dict(margins),
        "alpha": ALPHA,
        "train_start": str(train_start),
        "train_end": str(train_end),
        "cal_start": str(cal_start),
        "cal_end": str(cal_end),
        "model_type": "rte_calendar",
    }

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    temporary = path.with_name(path.name + ".tmp")

    joblib.dump(artifact, temporary)
    os.replace(temporary, path)

    print(f"LightGBM artifact saved: {path}")

    return artifact
