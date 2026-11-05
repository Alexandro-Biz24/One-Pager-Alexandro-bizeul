
"""Independent daily SARIMA inference.

Origin: D at 13:00 Europe/Paris.
Last historical observation: D-1 at 23:00 Europe/Paris.
Input: 90 days of observed load, no engineered features.
Output: D+1 predictions and native 95% prediction intervals.
"""

from datetime import date, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX

from timeseries.pipeline.clock import PARIS, paris_hours
from timeseries.pipeline.store import connect
from timeseries.statistical.train_sarima import (
    ARTIFACT,
    INFERENCE_DAYS,
    ORDER,
    SEASONAL_ORDER,
    last_training_hour,
    read_load,
)


def target_hours(day: date) -> pd.DatetimeIndex:
    """Return valid D+1 UTC targets following the project DST rule."""

    hours = paris_hours(day + timedelta(days=1))
    local = hours.tz_convert(PARIS)

    # Autumn: exclude the first occurrence of repeated 02:00.
    duplicated = pd.Index(local.hour).duplicated(keep="last")

    return hours[~duplicated]


def init_prediction_table(db):
    """Create the independent prediction table if necessary."""

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS sarima_predictions (
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


def read_existing_predictions(targets):
    """Check whether all target predictions already exist."""

    with connect() as db:
        rows = db.execute(
            """
            SELECT utc, prediction_mw, lower_95_mw, upper_95_mw
            FROM sarima_predictions
            WHERE utc >= %s AND utc <= %s
            ORDER BY utc
            """,
            (
                targets.min().to_pydatetime(),
                targets.max().to_pydatetime(),
            ),
        ).fetchall()

    frame = pd.DataFrame(
        rows,
        columns=[
            "utc",
            "prediction_mw",
            "lower_95_mw",
            "upper_95_mw",
        ],
    )

    if frame.empty:
        return frame

    frame["utc"] = pd.to_datetime(frame["utc"], utc=True)

    return frame.set_index("utc").reindex(targets)


def predict_sarima(
    run_day: date,
    write: bool = False,
    artifact_path: Path = ARTIFACT,
) -> pd.DataFrame:
    """Predict D+1 with fixed parameters and a 90-day load window."""

    path = Path(artifact_path)

    if not path.exists():
        raise FileNotFoundError(
            f"SARIMA artifact missing: {path}. "
            "Run manual training first."
        )

    artifact = joblib.load(path)

    if (
        tuple(artifact["order"]) != ORDER
        or tuple(artifact["seasonal_order"]) != SEASONAL_ORDER
        or artifact["inference_days"] != INFERENCE_DAYS
    ):
        raise RuntimeError("Incompatible SARIMA artifact.")

    targets = target_hours(run_day)

    origin = pd.Timestamp(
        year=run_day.year,
        month=run_day.month,
        day=run_day.day,
        hour=13,
        tz=PARIS,
    ).tz_convert("UTC")

    # ---------------------------------------------------------
    # 1. Fixed historical cutoff: D-1 at 23:00 French time.
    # ---------------------------------------------------------

    last = last_training_hour(run_day)

    first = last - pd.Timedelta(
        hours=24 * INFERENCE_DAYS - 1
    )

    training_end = pd.Timestamp(
        artifact["training_end_utc"]
    ).tz_convert("UTC")

    # ---------------------------------------------------------
    # 2. Skip computation if the whole target is already stored.
    # ---------------------------------------------------------

    if write:
        with connect() as db:
            init_prediction_table(db)

        existing = read_existing_predictions(targets)

        if (
            len(existing) == len(targets)
            and existing.notna().all().all()
        ):
            print(f"SKIP {run_day}: SARIMA predictions already stored.")
            return existing

    # ---------------------------------------------------------
    # 3. Read exactly 90 days of raw historical consumption.
    # ---------------------------------------------------------

    y = read_load(first, last)

    assert len(y) == 90 * 24
    assert y.index.max() < origin

    # ---------------------------------------------------------
    # 4. Reconstruct the state without refitting parameters.
    # ---------------------------------------------------------

    model = SARIMAX(
        endog=y,
        order=ORDER,
        seasonal_order=SEASONAL_ORDER,
        trend="n",
        simple_differencing=False,
    )

    result = model.filter(
        np.asarray(artifact["parameters"], dtype=float)
    )

    # ---------------------------------------------------------
    # 5. Forecast from historical cutoff through the end of D+1.
    # ---------------------------------------------------------

    horizon = pd.date_range(
        start=last + pd.Timedelta(hours=1),
        end=targets.max(),
        freq="h",
        tz="UTC",
    )

    forecast = result.get_forecast(steps=len(horizon))

    mean = pd.Series(
        np.asarray(forecast.predicted_mean, dtype=float),
        index=horizon,
    )

    ci = np.asarray(
        forecast.conf_int(alpha=0.05),
        dtype=float,
    )

    lower = pd.Series(ci[:, 0], index=horizon)
    upper = pd.Series(ci[:, 1], index=horizon)

    predictions = pd.DataFrame(
        {
            "prediction_mw": mean.reindex(targets),
            "lower_95_mw": lower.reindex(targets),
            "upper_95_mw": upper.reindex(targets),
        },
        index=targets,
    )

    predictions.index.name = "utc"

    if not np.isfinite(predictions.to_numpy()).all():
        raise RuntimeError("SARIMA returned incomplete predictions.")

    if not (
        (predictions["lower_95_mw"] <= predictions["prediction_mw"])
        & (predictions["prediction_mw"] <= predictions["upper_95_mw"])
    ).all():
        raise RuntimeError("Invalid SARIMA prediction intervals.")

    # ---------------------------------------------------------
    # 6. Optional idempotent insertion into Neon.
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
            for utc, row in predictions.iterrows()
        ]

        with connect() as db:
            # A target must already exist in hourly_data.
            existing_targets = db.execute(
                """
                SELECT utc FROM hourly_data
                WHERE utc >= %s AND utc <= %s
                """,
                (
                    targets.min().to_pydatetime(),
                    targets.max().to_pydatetime(),
                ),
            ).fetchall()

            present = {
                pd.Timestamp(r[0]).tz_convert("UTC")
                for r in existing_targets
            }

            if not set(targets).issubset(present):
                raise RuntimeError(
                    "Missing target timestamps in hourly_data. "
                    "Run the daily data-feeding pipeline first."
                )

            with db.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO sarima_predictions (
                        utc,
                        prediction_mw,
                        lower_95_mw,
                        upper_95_mw,
                        origin_utc
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (utc) DO NOTHING
                    """,
                    rows,
                )

        print(f"STORED {run_day}: {len(predictions)} predictions.")

    else:
        print(f"DRY RUN {run_day}: no predictions stored.")

    print(
        f"SARIMA | {len(y)} historical hours | "
        f"{len(predictions)} target hours | "
        f"last load: {last}"
    )

    return predictions
