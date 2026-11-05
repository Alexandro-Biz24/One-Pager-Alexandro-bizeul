from __future__ import annotations

import os

from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from mtst import MTSTForecaster

from timeseries.dl.dataset_mtst import (
    FEATURES,
    day_tensors,
    read_neon,
)

from timeseries.dl.train_mtst import (
    DEFAULT_WEIGHTS,
    choose_device,
)

from timeseries.pipeline.clock import paris_hours
from timeseries.pipeline.store import connect


PARIS = "Europe/Paris"


def load_model(
    weights_path: str | Path = DEFAULT_WEIGHTS,
    device: str | None = None,
):
    """
    Load a pre-trained MTST and its frozen preprocessing.

    Never trains, refits or recalibrates the model.
    """
    path = Path(weights_path)

    if not path.is_file():
        raise FileNotFoundError(
            f"MTST weights not found: {path}"
        )

    device = device or choose_device()

    checkpoint = torch.load(
        path,
        map_location="cpu",
        weights_only=True,
    )

    if checkpoint["features"] != FEATURES:
        raise RuntimeError(
            "Feature mismatch between checkpoint "
            "and current pipeline"
        )

    model = MTSTForecaster(
        **checkpoint["config"]
    )

    model.load_state_dict(
        checkpoint["model_state_dict"]
    )

    model = model.to(device)
    model.eval()

    return model, checkpoint, device


class FrozenScaler:
    """
    Minimal read-only scaler compatible with day_tensors().

    No fitting and no sklearn dependency at inference.
    """

    def __init__(self, mean, scale):
        self.mean_ = np.asarray(
            mean,
            dtype=np.float64,
        )

        self.scale_ = np.asarray(
            scale,
            dtype=np.float64,
        )

        if (
            not np.isfinite(self.mean_).all()
            or not np.isfinite(self.scale_).all()
            or np.any(self.scale_ <= 0)
        ):
            raise RuntimeError(
                "Invalid frozen scaler parameters"
            )


def init_prediction_table():
    """
    Idempotent creation of the dedicated MTST results table.

    One prediction per real UTC hour.
    """
    sql = """
        CREATE TABLE IF NOT EXISTS mtst_predictions (
            utc timestamptz PRIMARY KEY,
            prediction double precision NOT NULL,
            lower_95 double precision NOT NULL,
            upper_95 double precision NOT NULL,
            predicted_at timestamptz NOT NULL
                DEFAULT now(),
            model_train_end date NOT NULL
        )
    """

    with connect() as db:
        with db.cursor() as cur:
            cur.execute(sql)

        db.commit()


def write_predictions(
    predictions: pd.DataFrame,
    train_end: date,
) -> int:
    """
    Write once. Existing predictions are never overwritten.

    Returns the number of newly inserted hours.
    """
    if predictions.empty:
        return 0

    sql = """
        INSERT INTO mtst_predictions (
            utc,
            prediction,
            lower_95,
            upper_95,
            model_train_end
        )
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (utc) DO NOTHING
    """

    rows = []

    for utc, row in predictions.iterrows():
        rows.append(
            (
                utc.to_pydatetime(),
                float(row["prediction"]),
                float(row["lower_95"]),
                float(row["upper_95"]),
                train_end,
            )
        )

    with connect() as db:
        with db.cursor() as cur:
            cur.executemany(
                sql,
                rows,
                returning=False,
            )

            inserted = cur.rowcount

        db.commit()

    return int(inserted)


def predict_day(
    day: date,
    *,
    weights_path: str | Path | None = None,
    device: str | None = None,
    write: bool = True,
) -> pd.DataFrame:
    """
    Predict the French-local TARGET day.

    Operational convention:
        Run at J 13:00 Europe/Paris.
        Predict J+1.

    Therefore call:
        predict_day(J + timedelta(days=1))

    Returns a UTC-indexed DataFrame containing:
        prediction
        lower_95
        upper_95

    No training, no new API calls and no feature engineering.
    """
    if weights_path is None:
        weights_path = os.environ.get(
            "MTST_WEIGHTS",
            str(DEFAULT_WEIGHTS),
        )

    model, checkpoint, device = load_model(
        weights_path,
        device,
    )

    train_end = date.fromisoformat(
        checkpoint["train_end_exclusive"]
    )

    # Only target-day features are required.
    # Target load is deliberately never fetched.
    df = read_neon(
        day,
        day + timedelta(days=1),
        with_target=False,
    )

    scaler_x = FrozenScaler(
        checkpoint["x_mean"],
        checkpoint["x_scale"],
    )

    X, _, mask, timestamps = day_tensors(
        df,
        day,
        scaler_x,
        require_target=False,
    )

    valid = mask.numpy().astype(bool)

    expected = paris_hours(day)
    local = expected.tz_convert(PARIS)

    # Number of distinct local clock hours:
    # 23 for spring, 24 otherwise.
    expected_slots = len(
        np.unique(local.hour)
    )

    valid_slots = int(valid.sum())

    if valid_slots != expected_slots:
        missing_slots = [
            hour
            for hour in range(24)
            if timestamps[hour] is not None
            and not valid[hour]
        ]

        raise RuntimeError(
            f"Incomplete MTST features for {day}: "
            f"{valid_slots}/{expected_slots} slots. "
            f"Missing clock hours: {missing_slots}"
        )

    with torch.inference_mode():
        prediction_scaled = (
            model(
                X.unsqueeze(0).to(device)
            )
            .detach()
            .cpu()
            .numpy()
            .reshape(-1)
        )

    if prediction_scaled.shape != (24,):
        raise RuntimeError(
            "Expected 24 MTST outputs, got "
            f"{prediction_scaled.shape}"
        )

    # Reverse residual normalization.
    residuals_mw = (
        prediction_scaled
        * float(checkpoint["y_scale"])
        + float(checkpoint["y_mean"])
    )

    margins = np.asarray(
        checkpoint["hourly_margins_95"],
        dtype=np.float64,
    )

    if margins.shape != (24,):
        raise RuntimeError(
            "Invalid hourly conformal margins"
        )

    predictions = []

    for hour in range(24):
        if not valid[hour]:
            continue

        utc = timestamps[hour]

        # RTE base forecast, from the archived features.
        rte = float(
            df.at[utc, "prediction_d1"]
        )

        # Final forecast: RTE + MTST correction.
        point = rte + float(
            residuals_mw[hour]
        )

        margin = float(margins[hour])

        predictions.append(
            {
                "utc": utc,
                "prediction": point,
                "lower_95": point - margin,
                "upper_95": point + margin,
            }
        )

    result = pd.DataFrame(predictions)

    if result.empty:
        raise RuntimeError(
            "No MTST predictions produced"
        )

    result = (
        result
        .set_index("utc")
        .sort_index()
    )

    if result.index.has_duplicates:
        raise RuntimeError(
            "Duplicate UTC predictions"
        )

    if not np.isfinite(
        result[
            [
                "prediction",
                "lower_95",
                "upper_95",
            ]
        ].to_numpy()
    ).all():
        raise RuntimeError(
            "MTST produced non-finite predictions"
        )

    if write:
        init_prediction_table()

        write_predictions(
            result,
            train_end,
        )

    print(
        f"MTST {day} | "
        f"{len(result)} forecast hours | "
        f"device={device} | "
        f"write={write}"
    )

    return result


def predict_from_origin(
    origin_day: date,
    *,
    write: bool = True,
) -> pd.DataFrame:
    """
    Convenience function for the daily orchestrator.

    Input:
        J = current French-local forecasting day.

    Output:
        Forecast for J+1.
    """
    target_day = origin_day + timedelta(days=1)

    return predict_day(
        target_day,
        write=write,
    )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--origin-day",
        type=date.fromisoformat,
        required=True,
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
    )

    args = parser.parse_args()

    forecast = predict_from_origin(
        args.origin_day,
        write=not args.dry_run,
    )

    print(forecast)