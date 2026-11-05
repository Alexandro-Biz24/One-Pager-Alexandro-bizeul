
"""Daily RTE + LightGBM day-ahead inference.

Forecast origin: D at 13:00 Europe/Paris.
Targets: D+1 French clock hours.
Inputs: eight frozen features from hourly_data.
No model fitting or feature recomputation.
"""

from datetime import date, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from timeseries.pipeline.clock import PARIS, paris_hours
from timeseries.pipeline.store import connect
from timeseries.ml.train_lightgbm import (
    ARTIFACT,
    FEATURES,
)


def target_hours(day: date):
    """Select D+1 targets using the project's DST convention."""

    hours = paris_hours(day + timedelta(days=1))

    local_clock = hours.tz_convert(PARIS).tz_localize(None)

    # Autumn: retain the second 02:00 only.
    return hours[~local_clock.duplicated(keep="last")]


def read_future_features(day: date):
    """Read target-hour features already frozen in Neon."""

    targets = target_hours(day)

    cols = [
        "utc",
        *FEATURES,
        "rte_frozen_at",
        "features_frozen_at",
    ]

    with connect() as db:
        rows = db.execute(
            f"""
            SELECT {", ".join(cols)}
            FROM hourly_data
            WHERE utc >= %s AND utc <= %s
            ORDER BY utc
            """,
            (
                targets.min().to_pydatetime(),
                targets.max().to_pydatetime(),
            ),
        ).fetchall()

    df = pd.DataFrame(rows, columns=cols)

    if df.empty:
        raise RuntimeError(
            f"No prepared future data for {day + timedelta(days=1)}."
        )

    df["utc"] = pd.to_datetime(df["utc"], utc=True)
    df = df.set_index("utc").reindex(targets)
    df.index.name = "utc"

    required = FEATURES + [
        "rte_frozen_at",
        "features_frozen_at",
    ]

    if df[required].isna().any().any():
        missing = df[required].isna().sum()
        missing = missing[missing > 0]

        raise RuntimeError(
            f"Incomplete or unfrozen future data: {missing.to_dict()}"
        )

    if not np.isfinite(
        df[FEATURES].to_numpy(dtype=float)
    ).all():
        raise RuntimeError("Non-finite LightGBM future features.")

    # Ensure target features were not archived after the origin.
    origin = pd.Timestamp(
        year=day.year,
        month=day.month,
        day=day.day,
        hour=13,
        tz=PARIS,
    ).tz_convert("UTC")

    return df


def init_prediction_table(db):
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS lightgbm_predictions (
            utc TIMESTAMPTZ PRIMARY KEY
                REFERENCES hourly_data(utc),

            prediction_mw DOUBLE PRECISION NOT NULL,
            lower_95_mw DOUBLE PRECISION NOT NULL,
            upper_95_mw DOUBLE PRECISION NOT NULL,

            origin_utc TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CHECK (
                lower_95_mw <= prediction_mw
                AND prediction_mw <= upper_95_mw
            )
        )
        """
    )


def predict_lightgbm(
    run_day: date,
    write: bool = False,
    artifact_path: Path = ARTIFACT,
):
    """Forecast D+1 and optionally store missing predictions."""

    path = Path(artifact_path)

    if not path.exists():
        raise FileNotFoundError(
            f"No LightGBM artifact: {path}. "
            "Train the model manually first."
        )

    artifact = joblib.load(path)

    if artifact["features"] != FEATURES:
        raise RuntimeError("LightGBM feature schema mismatch.")

    if sorted(artifact["margins"]) != list(range(24)):
        raise RuntimeError("Incomplete conformal calibration.")

    targets = target_hours(run_day)

    origin = pd.Timestamp(
        year=run_day.year,
        month=run_day.month,
        day=run_day.day,
        hour=13,
        tz=PARIS,
    ).tz_convert("UTC")

    # ---------------------------------------------------------
    # 1. Skip inference if predictions already exist.
    # ---------------------------------------------------------

    if write:
        with connect() as db:
            init_prediction_table(db)

            rows = db.execute(
                """
                SELECT utc, prediction_mw, lower_95_mw, upper_95_mw
                FROM lightgbm_predictions
                WHERE utc >= %s AND utc <= %s
                ORDER BY utc
                """,
                (
                    targets.min().to_pydatetime(),
                    targets.max().to_pydatetime(),
                ),
            ).fetchall()

        if len(rows) == len(targets):
            existing = pd.DataFrame(
                rows,
                columns=[
                    "utc",
                    "prediction_mw",
                    "lower_95_mw",
                    "upper_95_mw",
                ],
            )

            existing["utc"] = pd.to_datetime(
                existing["utc"], utc=True
            )

            existing = existing.set_index("utc").reindex(targets)

            if existing.notna().all().all():
                print(f"SKIP {run_day}: forecasts already stored.")
                return existing

    # ---------------------------------------------------------
    # 2. Read the 24 future hours from Neon.
    # ---------------------------------------------------------

    data = read_future_features(run_day)

    model = artifact["model"]

    correction = model.predict(data[FEATURES])

    prediction = (
        data["prediction_d1"].to_numpy(dtype=float)
        + correction
    )

    # ---------------------------------------------------------
    # 3. Add calibrated hourly 95% prediction intervals.
    # ---------------------------------------------------------

    local_hours = targets.tz_convert(PARIS).hour

    margins = np.array([
        artifact["margins"][int(hour)]
        for hour in local_hours
    ])

    result = pd.DataFrame(
        {
            "prediction_mw": prediction,
            "lower_95_mw": prediction - margins,
            "upper_95_mw": prediction + margins,
        },
        index=targets,
    )

    result.index.name = "utc"

    if not np.isfinite(result.to_numpy()).all():
        raise RuntimeError("Invalid LightGBM predictions.")

    # ---------------------------------------------------------
    # 4. Optional immutable Neon insertion.
    # ---------------------------------------------------------

    if write:
        rows = [
            (
                utc.to_pydatetime(),
                float(row["prediction_mw"]),
                float(row["lower_95_mw"]),
                float(row["upper_95_mw"]),
                origin.to_pydatetime(),
            )
            for utc, row in result.iterrows()
        ]

        with connect() as db:
            with db.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO lightgbm_predictions (
                        utc, prediction_mw,
                        lower_95_mw, upper_95_mw, origin_utc
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (utc) DO NOTHING
                    """,
                    rows,
                )

        print(f"STORED {run_day}: LightGBM predictions.")

    else:
        print(f"DRY RUN {run_day}: no SQL writes.")

    return result
