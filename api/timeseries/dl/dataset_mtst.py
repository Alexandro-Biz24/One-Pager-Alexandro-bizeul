from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd
import torch

from sklearn.preprocessing import StandardScaler
from torch.utils.data import Dataset, DataLoader

from timeseries.pipeline.clock import paris_hours
from timeseries.pipeline.store import connect


PARIS = "Europe/Paris"

# Exactly the same eight inputs as LightGBM.
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

TARGET = "residual_target"


def read_neon(
    start_day: date,
    end_day: date,
    *,
    with_target: bool = True,
) -> pd.DataFrame:
    """
    Read hourly_data over French-local days [start_day, end_day).

    Timestamps remain UTC.
    No API calls, no interpolation and no database writes.
    """
    if end_day <= start_day:
        raise ValueError("end_day must be after start_day")

    start = paris_hours(start_day)[0]
    end = paris_hours(end_day)[0]

    columns = ["utc", *FEATURES]

    if with_target:
        columns.append("load")

    sql = f"""
        SELECT {", ".join(columns)}
        FROM hourly_data
        WHERE utc >= %s
          AND utc < %s
        ORDER BY utc
    """

    with connect() as db:
        with db.cursor() as cur:
            cur.execute(
                sql,
                (
                    start.to_pydatetime(),
                    end.to_pydatetime(),
                ),
            )
            rows = cur.fetchall()

    if not rows:
        raise RuntimeError(
            f"No data available in Neon between "
            f"{start_day} and {end_day}"
        )

    df = pd.DataFrame(rows, columns=columns)

    df["utc"] = pd.to_datetime(df["utc"], utc=True)

    df = df.set_index("utc").sort_index()

    if df.index.has_duplicates:
        raise RuntimeError(
            "Duplicate UTC timestamps found in hourly_data"
        )

    numeric_columns = FEATURES.copy()

    if with_target:
        numeric_columns.append("load")

    for col in numeric_columns:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    if with_target:
        # Same residual correction target as LightGBM.
        df[TARGET] = df["load"] - df["prediction_d1"]

    return df


def _excluded_autumn_hour(
    hours: pd.DatetimeIndex,
) -> np.ndarray:
    """
    On autumn DST, exclude the FIRST occurrence of 02:00.
    Keep the SECOND occurrence.
    """
    local = hours.tz_convert(PARIS)

    duplicated = pd.Index(local.hour).duplicated(
        keep="last"
    )

    return np.asarray(duplicated, dtype=bool)


def _valid_training_rows(
    df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Select genuinely valid historical observations.

    DST exclusion is applied before fitting scalers.
    """
    local = df.index.tz_convert(PARIS)

    duplicate_keys = pd.MultiIndex.from_arrays(
        [local.date, local.hour]
    )

    keep = ~duplicate_keys.duplicated(keep="last")

    required = FEATURES + [TARGET]

    clean = (
        df.loc[keep, required]
        .replace([np.inf, -np.inf], np.nan)
        .dropna()
    )

    return clean


def fit_scalers(
    train_df: pd.DataFrame,
) -> tuple[StandardScaler, StandardScaler]:
    """
    Fit both scalers on TRAIN only.
    """
    valid = _valid_training_rows(train_df)

    if valid.empty:
        raise RuntimeError(
            "No valid rows available to fit MTST scalers"
        )

    scaler_x = StandardScaler()
    scaler_y = StandardScaler()

    scaler_x.fit(
        valid[FEATURES].to_numpy(dtype=np.float64)
    )

    scaler_y.fit(
        valid[[TARGET]].to_numpy(dtype=np.float64)
    )

    return scaler_x, scaler_y


def day_tensors(
    df: pd.DataFrame,
    day: date,
    scaler_x: StandardScaler,
    scaler_y: StandardScaler | None = None,
    *,
    require_target: bool = True,
):
    """
    Build exactly one French-local day.

    X          : torch.FloatTensor (24, 8)
    y          : torch.FloatTensor (24,)
    mask       : torch.FloatTensor (24,)
    timestamps : list of 24 UTC timestamps or None

    Normal day  : 24 valid clock slots
    Spring DST  : 23 valid clock slots
    Autumn DST  : 24 slots, second 02:00 retained

    Missing input features or target observations are masked.

    There is no fitting here: only saved scalers are used.
    """
    expected = paris_hours(day)
    local = expected.tz_convert(PARIS)

    excluded = _excluded_autumn_hour(expected)

    X = np.zeros(
        (24, len(FEATURES)),
        dtype=np.float32,
    )

    y = np.zeros(24, dtype=np.float32)
    mask = np.zeros(24, dtype=np.float32)

    timestamps = [None] * 24

    # Reindexing makes missing UTC rows explicit.
    daily = df.reindex(expected)

    for i, (utc, local_hour) in enumerate(
        zip(expected, local.hour)
    ):
        if excluded[i]:
            continue

        slot = int(local_hour)

        timestamps[slot] = utc

        values = daily.loc[
            utc, FEATURES
        ].to_numpy(dtype=np.float64)

        if not np.isfinite(values).all():
            continue

        if require_target:
            if scaler_y is None:
                raise ValueError(
                    "scaler_y is required for training"
                )

            target = daily.at[utc, TARGET]

            if not np.isfinite(target):
                continue

            y[slot] = (
                float(target) - scaler_y.mean_[0]
            ) / scaler_y.scale_[0]

        scaled = (
            values - scaler_x.mean_
        ) / scaler_x.scale_

        X[slot] = scaled.astype(np.float32)
        mask[slot] = 1.0

    return (
        torch.from_numpy(X),
        torch.from_numpy(y),
        torch.from_numpy(mask),
        timestamps,
    )


class MTSTDailyDataset(Dataset):
    """
    One sample = one forecasting day.

    Each sample:
        X    : (24, 8)
        y    : (24,)
        mask : (24,)
    """

    def __init__(
        self,
        df: pd.DataFrame,
        start_day: date,
        end_day: date,
        scaler_x: StandardScaler,
        scaler_y: StandardScaler,
        *,
        min_hours: int = 23,
    ):
        self.samples = []
        self.days = []

        if not 1 <= min_hours <= 24:
            raise ValueError(
                "min_hours must be between 1 and 24"
            )

        day = start_day

        while day < end_day:
            X, y, mask, _ = day_tensors(
                df,
                day,
                scaler_x,
                scaler_y,
                require_target=True,
            )

            if mask.sum().item() >= min_hours:
                self.samples.append((X, y, mask))
                self.days.append(day)

            day += timedelta(days=1)

        if not self.samples:
            raise RuntimeError(
                "No usable MTST training days in "
                f"[{start_day}, {end_day})"
            )

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, index):
        return self.samples[index]


def make_loader(
    dataset: MTSTDailyDataset,
    *,
    batch_size: int = 8,
    shuffle: bool = False,
) -> DataLoader:
    """
    PyTorch DataLoader with DST-aware daily tensors.
    """
    return DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=shuffle,
        num_workers=0,
        pin_memory=torch.cuda.is_available(),
    )


def stack_dataset(
    dataset: MTSTDailyDataset,
):
    """
    Convert daily samples to complete tensors.

    MTSTForecaster.fit() accepts these tensors directly,
    as in Project_RTE.ipynb.

    X    : (N, 24, 8)
    y    : (N, 24)
    mask : (N, 24)
    """
    X = torch.stack(
        [sample[0] for sample in dataset]
    )

    y = torch.stack(
        [sample[1] for sample in dataset]
    )

    mask = torch.stack(
        [sample[2] for sample in dataset]
    )

    return X, y, mask