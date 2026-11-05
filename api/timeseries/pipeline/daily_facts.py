"""
Daily feature engineering for hourly_data.

Two entry points:

run_day(day):
    Daily production.
    Fetch missing observations and RTE D+1.
    Freeze the target-day features.

build_features_day(day):
    Historical feature backfill.
    Read exclusively from Neon.
    No external API calls.

Convention:
    day = forecast origin J
    target = J+1

Raw data and existing frozen features are never overwritten.
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from timeseries.pipeline.clock import (
    PARIS,
    day_bounds,
    paris_hours,
)

from timeseries.pipeline.fetch import (
    fetch_consumption,
    fetch_temperature,
)

from timeseries.pipeline.fetch_future_rte import (
    fetch_future_rte,
)

from timeseries.pipeline.features import engineer

from timeseries.pipeline.store import (
    FEATURES,
    connect,
    init_tables,
    read_window,
    read_target,
    write_rte_once,
    write_features_once,
    write_observed,
)


def _valid_hours(day: date) -> pd.DatetimeIndex:
    """
    Return the hours used for modelling.

    Normal day: 24
    Spring DST: 23
    Autumn DST: 24 (first repeated 02:00 excluded)
    """
    hours = paris_hours(day)

    local = (
        hours
        .tz_convert(PARIS)
        .tz_localize(None)
    )

    excluded = local.duplicated(keep="last")

    return hours[~excluded]


def _missing_observations(
    db,
    day: date,
) -> pd.DataFrame:
    """
    Fetch only genuinely missing historical observations.

    Never overwrite already stored values.
    Ignore the excluded autumn DST hour.
    """
    hours = paris_hours(day)
    valid = _valid_hours(day)

    start, end = day_bounds(day)

    stored = read_window(
        db,
        start,
        end,
    ).reindex(hours)

    missing_load = stored["load"].isna()
    missing_temp = stored["temperature"].isna()

    eligible = hours.isin(valid)

    missing_load = (
        missing_load
        & eligible
    )

    missing_temp = (
        missing_temp
        & eligible
    )

    new = pd.DataFrame(
        index=hours,
        columns=["load", "temperature"],
        dtype=float,
    )

    if missing_load.any():
        fetched = fetch_consumption(
            start,
            end,
            "REALISED",
        )

        load = pd.to_numeric(
            fetched["load"].reindex(hours),
            errors="coerce",
        )

        if load[missing_load].isna().any():
            raise RuntimeError(
                f"Incomplete historical load: {day}"
            )

        new.loc[missing_load, "load"] = (
            load.loc[missing_load]
        )

    if missing_temp.any():
        temperature = pd.to_numeric(
            fetch_temperature(
                start,
                end,
            ).reindex(hours),
            errors="coerce",
        )

        if temperature[missing_temp].isna().any():
            raise RuntimeError(
                f"Incomplete historical temperature: {day}"
            )

        new.loc[missing_temp, "temperature"] = (
            temperature.loc[missing_temp]
        )

    return new.loc[
        missing_load | missing_temp
    ]


def _prepare_history(
    raw: pd.DataFrame,
    origin_day: date,
) -> pd.DataFrame:
    """
    Prepare an in-memory copy for feature engineering.

    Interpolate only short historical gaps (maximum 2 hours).

    No interpolated value is written back to load,
    temperature or prediction_d1 in Neon.

    No future load is used.
    """
    data = raw.copy().sort_index()

    # Historical observations available strictly before J 00h.
    # This is conservative relative to our J 13h forecast.
    cutoff = paris_hours(origin_day)[0]

    historical = data.index < cutoff

    for col in (
        "load",
        "temperature",
        "prediction_d1",
    ):
        series = pd.to_numeric(
            data.loc[historical, col],
            errors="coerce",
        )

        series = series.replace(
            [np.inf, -np.inf],
            np.nan,
        )

        # Work only on the temporary historical copy.
        series = series.interpolate(
            method="time",
            limit=2,
            limit_area="inside",
        )

        data.loc[historical, col] = series

    return data


def _read_existing(
    db,
    target_day: date,
) -> pd.DataFrame:
    hours = paris_hours(target_day)

    end = hours[-1] + pd.Timedelta(hours=1)

    return read_target(
        db,
        hours[0],
        end,
    ).reindex(hours)


def _prepare_features(
    db,
    day: date,
    forecast: pd.Series,
    observations: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """
    Shared feature engineering for historical and daily jobs.

    Returns all target-day timestamps, including the
    excluded autumn DST hour.

    Only the valid modelling hours are required to have
    complete engineered features.
    """
    target_day = day + timedelta(days=1)

    target_hours = paris_hours(target_day)
    valid = _valid_hours(target_day)

    start = (
        target_hours[0]
        - pd.Timedelta(hours=168)
    )

    end = (
        target_hours[-1]
        + pd.Timedelta(hours=1)
    )

    raw = read_window(
        db,
        start,
        end,
    )

    full_index = pd.date_range(
        start=start,
        end=end,
        inclusive="left",
        freq="h",
        tz="UTC",
    )

    raw = raw.reindex(full_index)
    raw.index.name = "utc"

    # Integrate observations fetched during the current
    # transaction, without changing stored raw data.
    if observations is not None:
        for utc, row in observations.iterrows():
            for col in ("load", "temperature"):
                if (
                    utc in raw.index
                    and pd.isna(raw.at[utc, col])
                    and pd.notna(row[col])
                ):
                    raw.at[utc, col] = float(
                        row[col]
                    )

    # Integrate archived / fetched target RTE forecasts.
    for utc, value in forecast.items():
        if (
            utc in raw.index
            and pd.isna(raw.at[utc, "prediction_d1"])
            and pd.notna(value)
        ):
            raw.at[utc, "prediction_d1"] = float(
                value
            )

    # Temporary processing, never a raw database update.
    prepared_raw = _prepare_history(
        raw,
        day,
    )

    featured = engineer(
        prepared_raw
    )

    prepared = featured.reindex(target_hours)

    required = [
        "prediction_d1",
        *FEATURES,
    ]

    missing = (
        prepared.loc[valid, required]
        .replace([np.inf, -np.inf], np.nan)
        .isna()
        .sum()
    )

    missing = missing[missing > 0]

    if not missing.empty:
        raise RuntimeError(
            f"Cannot prepare features for {target_day}: "
            f"{missing.to_dict()}"
        )

    return prepared


def _freeze_target(
    db,
    day: date,
    prepared: pd.DataFrame,
    forecast: pd.Series,
    existing: pd.DataFrame,
    frozen_at: pd.Timestamp,
):
    """
    Persist only missing target features.

    Preserve all already-frozen rows.
    """
    target_day = day + timedelta(days=1)

    valid = _valid_hours(target_day)

    # Insert / archive RTE where required.
    # Existing prediction_d1 values remain unchanged.
    write_rte_once(
        db,
        forecast,
        frozen_at,
    )

    frozen = (
        existing.loc[
            valid,
            "features_frozen_at",
        ].notna()
    )

    pending = valid[~frozen.to_numpy()]

    if len(pending):
        write_features_once(
            db,
            prepared.loc[pending],
            frozen_at,
        )

    saved = _read_existing(
        db,
        target_day,
    )

    if saved.loc[
        valid, "features_frozen_at"
    ].isna().any():
        raise RuntimeError(
            f"Features not fully frozen for {target_day}"
        )

    return saved


def build_features_day(
    day: date,
    *,
    dry_run: bool = True,
) -> pd.DataFrame:
    """
    HISTORICAL FEATURE ENGINEERING.

    Reads only Neon.

    No RTE fetch.
    No weather fetch.
    No modification of raw observations.

    day = origin J
    features = target J+1
    """
    target_day = day + timedelta(days=1)

    target_hours = paris_hours(target_day)
    valid = _valid_hours(target_day)

    if not dry_run:
        init_tables()

    with connect() as db:
        existing = _read_existing(
            db,
            target_day,
        )

        frozen = existing.loc[
            valid,
            "features_frozen_at",
        ].notna()

        if frozen.all():
            print(
                f"SKIP {target_day}: "
                "features already frozen"
            )

            return existing

        forecast = pd.to_numeric(
            existing["prediction_d1"],
            errors="coerce",
        )

        if forecast.loc[valid].isna().any():
            raise RuntimeError(
                f"Missing archived RTE forecasts "
                f"for {target_day}"
            )

        prepared = _prepare_features(
            db,
            day,
            forecast,
        )

        if dry_run:
            print(
                f"DRY RUN {target_day}: "
                f"{len(valid)} valid hours"
            )

            return prepared

        frozen_at = pd.Timestamp.now(tz="UTC")

        saved = _freeze_target(
            db,
            day,
            prepared,
            forecast,
            existing,
            frozen_at,
        )

        print(
            f"COMMITTED {target_day}: "
            f"{len(valid)} valid hours"
        )

        return saved


def run_day(
    day: date,
    *,
    dry_run: bool = True,
) -> pd.DataFrame:
    """
    DAILY PRODUCTION PIPELINE.

    Called on day J to prepare J+1.

    1. Complete missing observations of J-1.
    2. Fetch RTE D-1 forecast for J+1 if needed.
    3. Engineer target features.
    4. Freeze missing features and archive RTE.

    Safe to rerun without replacing existing data.
    """
    target_day = day + timedelta(days=1)

    target_hours = paris_hours(target_day)
    valid = _valid_hours(target_day)

    if not dry_run:
        init_tables()

    frozen_at = pd.Timestamp.now(tz="UTC")

    with connect() as db:
        existing = _read_existing(
            db,
            target_day,
        )

        # Complete historical J-1 only if necessary.
        observations = _missing_observations(
            db,
            day - timedelta(days=1),
        )

        frozen = existing.loc[
            valid,
            "features_frozen_at",
        ].notna()

        if frozen.all():
            if not dry_run:
                write_observed(
                    db,
                    observations,
                )

            print(
                f"SKIP {target_day}: "
                "features already frozen"
            )

            return existing

        forecast = pd.to_numeric(
            existing["prediction_d1"],
            errors="coerce",
        )

        if forecast.loc[valid].isna().any():
            fetched = fetch_future_rte(
                day
            ).reindex(target_hours)

            forecast = forecast.fillna(
                fetched
            )

        if forecast.loc[valid].isna().any():
            raise RuntimeError(
                f"Incomplete RTE D-1 for {target_day}"
            )

        prepared = _prepare_features(
            db,
            day,
            forecast,
            observations,
        )

        if dry_run:
            print(
                f"DRY RUN {target_day}: "
                f"{len(valid)} valid hours. "
                "No writes."
            )

            return prepared

        # All writes occur in the same transaction.
        write_observed(
            db,
            observations,
        )

        saved = _freeze_target(
            db,
            day,
            prepared,
            forecast,
            existing,
            frozen_at,
        )

        print(
            f"COMMITTED {target_day}: "
            f"{len(valid)} valid hours"
        )

        return saved