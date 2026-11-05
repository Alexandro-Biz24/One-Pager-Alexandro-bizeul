
"""Train and persist SARIMA(3,0,3)x(0,1,0,24).

Training is triggered manually from sarima_training.ipynb.
Only historical observed load is used.
"""

from datetime import date, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX

from timeseries.pipeline.clock import PARIS
from timeseries.pipeline.store import connect

ORDER = (3, 0, 3)
SEASONAL_ORDER = (0, 1, 0, 24)
TRAIN_DAYS = 365
INFERENCE_DAYS = 90

ARTIFACT = (
    Path(__file__).resolve().parent
    / "artifacts"
    / "sarima_model.joblib"
)


def local_midnight(day: date) -> pd.Timestamp:
    return pd.Timestamp(
        year=day.year,
        month=day.month,
        day=day.day,
        tz=PARIS,
    )


def last_training_hour(day: date) -> pd.Timestamp:
    """Last UTC hour of D-1, where D is the reference day."""
    return (
        local_midnight(day) - pd.Timedelta(hours=1)
    ).tz_convert("UTC")


def read_load(start: pd.Timestamp, end: pd.Timestamp) -> pd.Series:
    """Load a complete UTC hourly history from Neon, inclusive."""

    expected = pd.date_range(
        start=start,
        end=end,
        freq="h",
        tz="UTC",
        name="utc",
    )

    with connect() as db:
        rows = db.execute(
            """
            SELECT utc, load
            FROM hourly_data
            WHERE utc >= %s AND utc <= %s
            ORDER BY utc
            """,
            (
                start.to_pydatetime(),
                end.to_pydatetime(),
            ),
        ).fetchall()

    if not rows:
        raise RuntimeError("No historical load found in Neon.")

    df = pd.DataFrame(rows, columns=["utc", "load"])
    df["utc"] = pd.to_datetime(df["utc"], utc=True)

    if df["utc"].duplicated().any():
        raise RuntimeError("Duplicate UTC timestamps.")

    y = (
        df.set_index("utc")["load"]
        .sort_index()
        .reindex(expected)
        .astype(float)
    )

    # Autoriser uniquement le NULL de la première
    # occurrence de 02h au changement d'heure d'hiver.
    local = y.index.tz_convert("Europe/Paris")

    local_naive = local.tz_localize(None)

    excluded = local_naive.duplicated(keep="last")

    missing = y.isna().to_numpy()

    unexpected = missing & ~excluded

    if unexpected.any():
        raise RuntimeError(
            f"Incomplete SARIMA history: "
            f"{unexpected.sum()} unexpected missing hours "
            f"between {start} and {end}."
        )

    # Interpolation uniquement en mémoire pour SARIMA.
    # Les valeurs enregistrées dans Neon restent inchangées.
    if missing.any():
        y = y.interpolate(
            method="time",
            limit_area="inside",
        )

    if y.isna().any():
        raise RuntimeError(
            "SARIMA history still contains missing values."
        )

    if not np.isfinite(y.to_numpy()).all():
        raise RuntimeError("Non-finite historical load values.")

    return y


def train_sarima(
    run_day: date,
    train_days: int = TRAIN_DAYS,
    artifact_path: Path = ARTIFACT,
):
    """Fit SARIMA using the year preceding reference day D."""

    if train_days < INFERENCE_DAYS:
        raise ValueError("Training must cover at least 90 days.")

    end = last_training_hour(run_day)
    start = end - pd.Timedelta(
        hours=24 * train_days - 1
    )

    y = read_load(start, end)

    model = SARIMAX(
        endog=y,
        order=ORDER,
        seasonal_order=SEASONAL_ORDER,
        trend="n",
        simple_differencing=False,
    )

    result = model.fit(
        disp=False,
        maxiter=250,
    )

    if not result.mle_retvals.get("converged", False):
        raise RuntimeError(
            "SARIMA optimization did not converge. "
            "Artifact was not saved."
        )

    artifact = {
        "order": ORDER,
        "seasonal_order": SEASONAL_ORDER,
        "trend": "n",
        "simple_differencing": False,
        "parameters": np.asarray(result.params, dtype=float),
        "parameter_names": list(result.param_names),
        "training_start_utc": start.isoformat(),
        "training_end_utc": end.isoformat(),
        "training_days": train_days,
        "inference_days": INFERENCE_DAYS,
        "aic": float(result.aic),
        "bic": float(result.bic),
        "statsmodels_version": __import__(
            "statsmodels"
        ).__version__,
    }

    path = Path(artifact_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    # Atomic artifact replacement.
    temporary = path.with_name(path.name + ".tmp")
    joblib.dump(artifact, temporary)
    temporary.replace(path)

    print(f"SARIMA trained: {len(y):,} observations")
    print(f"Training period: {start} → {end}")
    print(f"AIC: {result.aic:.2f}")
    print(f"Artifact saved: {path}")

    return artifact
