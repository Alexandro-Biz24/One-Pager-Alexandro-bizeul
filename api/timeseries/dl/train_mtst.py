from __future__ import annotations

from datetime import date
from pathlib import Path
import math

import numpy as np
import torch

from mtst import MTSTForecaster

from timeseries.dl.dataset_mtst import (
    FEATURES,
    MTSTDailyDataset,
    fit_scalers,
    make_loader,
    read_neon,
    stack_dataset,
)


DEFAULT_WEIGHTS = (
    Path(__file__).resolve().parent
    / "weights"
    / "mtst_best.pt"
)

# Architecture from Project_RTE.ipynb.
MODEL_CONFIG = {
    "input_dim": len(FEATURES),
    "output_shape": (24,),
    "embed_dim": 64,
    "heads": 4,
    "n_layers": 2,
    "dropout": 0.1,
    "resolutions": (1, 2, 4),
    "positional_encoding": "absolute",
}


def choose_device() -> str:
    if torch.cuda.is_available():
        return "cuda"

    if (
        hasattr(torch.backends, "mps")
        and torch.backends.mps.is_available()
    ):
        return "mps"

    return "cpu"


def conformal_quantile(
    errors: np.ndarray,
    alpha: float = 0.05,
) -> float:
    """
    Finite-sample split conformal margin.

    Returns a symmetric absolute-error margin in MW.
    """
    errors = np.asarray(
        errors,
        dtype=np.float64,
    )

    errors = errors[np.isfinite(errors)]

    if len(errors) == 0:
        raise RuntimeError(
            "No errors available for calibration"
        )

    errors = np.sort(errors)

    n = len(errors)

    k = min(
        math.ceil((n + 1) * (1 - alpha)),
        n,
    )

    return float(errors[k - 1])


def evaluate_calibration(
    model,
    dataset: MTSTDailyDataset,
    scaler_y,
    device: str,
):
    """
    Evaluate held-out daily sequences.

    Calibrate one absolute-error margin for each
    French local clock hour.
    """
    model.eval()

    errors_by_hour = {
        hour: [] for hour in range(24)
    }

    actual_values = []
    predicted_values = []

    with torch.inference_mode():
        for X, y, mask in dataset:
            X_batch = X.unsqueeze(0).to(device)

            pred_scaled = (
                model(X_batch)
                .detach()
                .cpu()
                .numpy()
                .reshape(-1)
            )

            if pred_scaled.shape != (24,):
                raise RuntimeError(
                    "MTST must output 24 residuals. "
                    f"Received {pred_scaled.shape}"
                )

            y_scaled = y.numpy()
            valid = mask.numpy().astype(bool)

            pred_mw = (
                pred_scaled * scaler_y.scale_[0]
                + scaler_y.mean_[0]
            )

            true_mw = (
                y_scaled * scaler_y.scale_[0]
                + scaler_y.mean_[0]
            )

            for hour in np.where(valid)[0]:
                error = abs(
                    float(
                        true_mw[hour]
                        - pred_mw[hour]
                    )
                )

                errors_by_hour[int(hour)].append(
                    error
                )

            actual_values.extend(
                true_mw[valid].tolist()
            )

            predicted_values.extend(
                pred_mw[valid].tolist()
            )

    actual_values = np.asarray(
        actual_values,
        dtype=np.float64,
    )

    predicted_values = np.asarray(
        predicted_values,
        dtype=np.float64,
    )

    if len(actual_values) < 30:
        raise RuntimeError(
            "Insufficient calibration observations"
        )

    absolute_errors = np.abs(
        actual_values - predicted_values
    )

    global_margin = conformal_quantile(
        absolute_errors
    )

    margins = []

    for hour in range(24):
        hourly_errors = np.asarray(
            errors_by_hour[hour],
            dtype=np.float64,
        )

        if len(hourly_errors) >= 20:
            margin = conformal_quantile(
                hourly_errors
            )
        else:
            margin = global_margin

        margins.append(margin)

    metrics = {
        "calibration_mae_mw": float(
            np.mean(absolute_errors)
        ),
        "calibration_rmse_mw": float(
            np.sqrt(
                np.mean(
                    (
                        actual_values
                        - predicted_values
                    ) ** 2
                )
            )
        ),
        "calibration_observations": int(
            len(actual_values)
        ),
        "global_margin_95_mw": global_margin,
    }

    return margins, metrics


def train(
    *,
    train_start: date = date(2024, 1, 1),
    train_end: date = date(2026, 1, 1),
    calibration_end: date = date(2026, 7, 1),
    epochs: int = 50,
    batch_size: int = 8,
    lr: float = 5e-4,
    weights_path: str | Path = DEFAULT_WEIGHTS,
    device: str | None = None,
    min_hours: int = 23,
):
    """
    Complete manual MTST training pipeline.

    Train:
        [train_start, train_end)

    Calibration:
        [train_end, calibration_end)

    No automatic retraining.

    Saves:
        - model weights
        - model configuration
        - feature ordering
        - input scaler
        - residual scaler
        - 95% conformal margins
        - training dates and metrics
    """
    if not (
        train_start < train_end < calibration_end
    ):
        raise ValueError(
            "Expected train_start < train_end "
            "< calibration_end"
        )

    if epochs < 1 or batch_size < 1 or lr <= 0:
        raise ValueError(
            "Invalid training hyperparameters"
        )

    torch.manual_seed(42)
    np.random.seed(42)

    device = device or choose_device()

    print("===================================")
    print("MTST — MANUAL TRAINING")
    print("===================================")
    print("Device:", device)
    print("Features:", FEATURES)
    print("Train:", train_start, "->", train_end)
    print(
        "Calibration:",
        train_end,
        "->",
        calibration_end,
    )

    # 1. Read the complete historical window from Neon.
    df = read_neon(
        train_start,
        calibration_end,
        with_target=True,
    )

    local_dates = (
        df.index
        .tz_convert("Europe/Paris")
        .date
    )

    train_df = df.loc[
        local_dates < train_end
    ].copy()

    # 2. Fit scalers exclusively on training history.
    scaler_x, scaler_y = fit_scalers(
        train_df
    )

    # 3. Build daily training sequences.
    train_dataset = MTSTDailyDataset(
        df,
        train_start,
        train_end,
        scaler_x,
        scaler_y,
        min_hours=min_hours,
    )

    train_loader = make_loader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
    )

    X_train, y_train, mask_train = (
        stack_dataset(train_dataset)
    )

    print("\nTraining dataset")
    print("Days:", len(train_dataset))
    print("Batches:", len(train_loader))
    print("X:", tuple(X_train.shape))
    print("y:", tuple(y_train.shape))
    print("Mask:", tuple(mask_train.shape))

    # 4. Initialize the published PyPI model.
    model = MTSTForecaster(
        **MODEL_CONFIG
    )

    rte_index = FEATURES.index(
        "prediction_d1"
    )

    # 5. Fit using the same API and loss as
    # Project_RTE.ipynb.
    history = model.fit(
        X_train,
        y_train,
        mask=mask_train,
        epochs=epochs,
        batch_size=batch_size,
        lr=lr,
        loss="rte_mape",
        loss_kwargs={
            "feature_index": rte_index,
            "x_mean": float(
                scaler_x.mean_[rte_index]
            ),
            "x_scale": float(
                scaler_x.scale_[rte_index]
            ),
            "y_mean": float(
                scaler_y.mean_[0]
            ),
            "y_scale": float(
                scaler_y.scale_[0]
            ),
        },
        device=device,
        log_every=25,
        verbose=True,
    )

    model = model.to(device)
    model.eval()

    # 6. Build independent calibration dataset.
    calibration_dataset = MTSTDailyDataset(
        df,
        train_end,
        calibration_end,
        scaler_x,
        scaler_y,
        min_hours=min_hours,
    )

    print(
        "\nCalibration days:",
        len(calibration_dataset),
    )

    # 7. Calibrate prediction intervals.
    margins, metrics = evaluate_calibration(
        model,
        calibration_dataset,
        scaler_y,
        device,
    )

    print("\nCalibration metrics")

    for key, value in metrics.items():
        print(f"{key}: {value}")

    # 8. Save the entire inference artifact.
    if history is None:
        history_values = []
    else:
        history_values = [
            float(value)
            for value in history
        ]

    checkpoint = {
        "model_state_dict": model.state_dict(),
        "config": MODEL_CONFIG.copy(),
        "features": FEATURES.copy(),

        "x_mean": scaler_x.mean_.tolist(),
        "x_scale": scaler_x.scale_.tolist(),

        "y_mean": float(
            scaler_y.mean_[0]
        ),
        "y_scale": float(
            scaler_y.scale_[0]
        ),

        "hourly_margins_95": margins,

        "train_start": train_start.isoformat(),
        "train_end_exclusive": (
            train_end.isoformat()
        ),
        "calibration_end_exclusive": (
            calibration_end.isoformat()
        ),

        "epochs": epochs,
        "batch_size": batch_size,
        "learning_rate": lr,

        "history": history_values,
        "metrics": metrics,
    }

    path = Path(weights_path)
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    torch.save(
        checkpoint,
        path,
    )

    print("\n===================================")
    print("MTST TRAINING COMPLETED")
    print("===================================")
    print("Weights saved:", path)

    return {
        "weights_path": str(path),
        "train_days": len(train_dataset),
        "calibration_days": len(
            calibration_dataset
        ),
        "metrics": metrics,
        "history": history_values,
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--train-start",
        type=date.fromisoformat,
        default=date(2024, 1, 1),
    )

    parser.add_argument(
        "--train-end",
        type=date.fromisoformat,
        default=date(2026, 1, 1),
    )

    parser.add_argument(
        "--calibration-end",
        type=date.fromisoformat,
        default=date(2026, 7, 1),
    )

    parser.add_argument(
        "--epochs",
        type=int,
        default=50,
    )

    parser.add_argument(
        "--batch-size",
        type=int,
        default=8,
    )

    parser.add_argument(
        "--lr",
        type=float,
        default=5e-4,
    )

    args = parser.parse_args()

    result = train(
        train_start=args.train_start,
        train_end=args.train_end,
        calibration_end=args.calibration_end,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
    )

    print(result)