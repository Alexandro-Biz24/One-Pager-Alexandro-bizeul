
"""Repair recent Neon history, oldest to newest."""

from __future__ import annotations

import logging
import time
from datetime import date, datetime, timedelta

import pandas as pd

from timeseries.pipeline.clock import PARIS, day_bounds, paris_hours
from timeseries.pipeline.fetch import fetch_consumption, fetch_temperature
from timeseries.pipeline.fetch_future_rte import fetch_future_rte
from timeseries.pipeline.store import FEATURES, connect, write_rte_once
from timeseries.statistical.rte_intervals import fill_rte_intervals

LOG = logging.getLogger("timeseries.backfill")

MODELS = ("sarima", "lightgbm", "mtst")

TABLES = {
    "sarima": "sarima_predictions",
    "lightgbm": "lightgbm_predictions",
    "mtst": "mtst_predictions",
}

COLUMNS = {
    "sarima": ("prediction_mw", "lower_95_mw", "upper_95_mw"),
    "lightgbm": ("prediction_mw", "lower_95_mw", "upper_95_mw"),
    "mtst": ("prediction", "lower_95", "upper_95"),
}


def valid_hours(day: date) -> pd.DatetimeIndex:
    hours = paris_hours(day)
    local = hours.tz_convert(PARIS).tz_localize(None)

    # Autumn: exclude the first repeated 02:00.
    return hours[~local.duplicated(keep="last")]


def retry(fn, label: str, attempts: int = 3):
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:
            LOG.warning(
                "%s | attempt %d/%d | %s: %s",
                label, attempt, attempts,
                type(exc).__name__, exc,
            )

            if attempt == attempts:
                raise

            time.sleep(min(attempt * 2, 5))


def present(
    day: date,
    columns: tuple[str, ...],
    table: str = "hourly_data",
) -> pd.DataFrame:

    expected = valid_hours(day)
    start, end = day_bounds(day)

    with connect() as db:
        rows = db.execute(
            f"""
            SELECT utc, {", ".join(columns)}
            FROM {table}
            WHERE utc >= %s AND utc < %s
            ORDER BY utc
            """,
            (start, end),
        ).fetchall()

    frame = pd.DataFrame(
        rows, columns=["utc", *columns]
    )

    if frame.empty:
        return pd.DataFrame(
            index=expected,
            columns=list(columns),
        )

    frame["utc"] = pd.to_datetime(
        frame["utc"], utc=True
    )

    return frame.set_index("utc").reindex(expected)


def missing_predictions(model: str, day: date) -> int:
    frame = present(
        day,
        COLUMNS[model],
        TABLES[model],
    )

    return int(frame.isna().any(axis=1).sum())


def features_ready(day: date) -> bool:
    columns = (
        "features_frozen_at",
        "rte_frozen_at",
        "prediction_d1",
        *FEATURES,
    )

    return bool(
        present(day, columns).notna().all().all()
    )


# ==========================================================
# PHASE 1 — HISTORICAL OBSERVATIONS
# ==========================================================

def repair_observations(day: date, *, write: bool):

    existing = present(day, ("load", "temperature"))

    missing_load = existing["load"].isna()
    missing_temp = existing["temperature"].isna()

    LOG.info(
        "RAW %s | missing load=%d temperature=%d",
        day,
        missing_load.sum(),
        missing_temp.sum(),
    )

    if not (missing_load.any() or missing_temp.any()):
        return

    if not write:
        return

    hours = valid_hours(day)
    start, end = day_bounds(day)

    load = pd.Series(index=hours, dtype=float)
    temp = pd.Series(index=hours, dtype=float)

    if missing_load.any():
        load = pd.to_numeric(
            fetch_consumption(
                start, end, "REALISED"
            )["load"],
            errors="coerce",
        ).reindex(hours)

    if missing_temp.any():
        temp = pd.to_numeric(
            fetch_temperature(start, end),
            errors="coerce",
        ).reindex(hours)

    rows = []

    for utc in hours:

        lv = (
            load.loc[utc]
            if missing_load.loc[utc]
            else None
        )

        tv = (
            temp.loc[utc]
            if missing_temp.loc[utc]
            else None
        )

        if pd.notna(lv) or pd.notna(tv):
            rows.append((
                utc.to_pydatetime(),
                utc.tz_convert(PARIS).to_pydatetime(),
                float(lv) if pd.notna(lv) else None,
                float(tv) if pd.notna(tv) else None,
            ))

    if rows:
        with connect() as db:
            with db.cursor() as cur:
                cur.executemany(
                    """
                    INSERT INTO hourly_data (
                        utc, tz_fr, load, temperature
                    )
                    VALUES (%s, %s, %s, %s)

                    ON CONFLICT (utc) DO UPDATE SET
                        load = COALESCE(
                            hourly_data.load,
                            EXCLUDED.load
                        ),
                        temperature = COALESCE(
                            hourly_data.temperature,
                            EXCLUDED.temperature
                        )
                    """,
                    rows,
                )

        LOG.info(
            "RAW %s | wrote %d rows",
            day, len(rows),
        )

    after = present(day, ("load", "temperature"))

    if after.isna().any().any():
        LOG.warning(
            "RAW %s | still missing %s",
            day,
            after.isna().sum().to_dict(),
        )


# ==========================================================
# PHASE 2 — RTE FORECAST
# ==========================================================


def repair_rte(day: date, *, write: bool):
    """
    Repair RTE D-1 forecasts and their 95% conformal intervals.

    - Fetch missing RTE forecasts.
    - Preserve existing RTE forecasts.
    - Fill missing conformal bounds.
    - Never overwrite existing intervals.
    """

    existing = present(
        day,
        ("prediction_d1",),
    )

    missing = existing["prediction_d1"].isna()

    LOG.info(
        "RTE %s | missing forecasts=%d",
        day,
        int(missing.sum()),
    )

    # ==================================================
    # STEP 1 — REPAIR MISSING RTE FORECASTS
    # ==================================================

    if missing.any() and write:

        forecast = fetch_future_rte(
            day - timedelta(days=1)
        ).reindex(valid_hours(day))

        values = forecast.loc[missing]

        if values.isna().any():
            raise RuntimeError(
                f"Incomplete RTE forecast for {day}: "
                f"{int(values.isna().sum())} missing"
            )

        with connect() as db:
            write_rte_once(
                db,
                values,
                pd.Timestamp.now(tz="UTC"),
            )

        LOG.info(
            "RTE %s | wrote %d missing forecasts",
            day,
            len(values),
        )

    # ==================================================
    # STEP 2 — REPAIR 95% CONFORMAL INTERVALS
    # ==================================================

    count = fill_rte_intervals(
        start=day,
        end=day,
        write=write,
    )

    LOG.info(
        "RTE INTERVALS %s | write=%s | rows=%d",
        day,
        write,
        count,
    )

    # ==================================================
    # STEP 3 — VERIFY COMPLETENESS
    # ==================================================

    if write:

        after = present(
            day,
            (
                "prediction_d1",
                "rte_lower_95",
                "rte_upper_95",
            ),
        )

        missing_after = after.isna().sum()

        if missing_after.any():
            raise RuntimeError(
                f"RTE data incomplete for {day}: "
                f"{missing_after.to_dict()}"
            )

        LOG.info(
            "RTE %s | forecasts and intervals complete",
            day,
        )



# ==========================================================
# PHASE 3 — FROZEN FEATURES
# ==========================================================

def repair_features(day: date, *, write: bool):

    if features_ready(day):
        LOG.info(
            "FEATURES %s | already complete",
            day,
        )
        return

    LOG.info(
        "FEATURES %s | preparing",
        day,
    )

    if not write:
        return

    from timeseries.pipeline import daily_facts

    # Preferred historical function, already used
    # for the initial feature backfill.
    if hasattr(daily_facts, "build_features_day"):
        daily_facts.build_features_day(
            day - timedelta(days=1),
            dry_run=False,
        )
    else:
        # Compatibility with the older pipeline version.
        daily_facts.run_day(
            day - timedelta(days=1),
            dry_run=False,
        )

    if not features_ready(day):
        raise RuntimeError(
            f"Features still incomplete for {day}"
        )

    LOG.info(
        "FEATURES %s | completed",
        day,
    )


# ==========================================================
# BACKFILL COORDINATOR
# ==========================================================

def run_backfill(
    origin_day: date,
    *,
    days: int = 7,
    write: bool = False,
    attempts: int = 3,
    infer=None,
) -> dict:

    if not 0 <= days <= 60:
        raise ValueError("days must be between 0 and 60")

    # J-7 -> J, oldest first.
    targets = [
        origin_day - timedelta(days=i)
        for i in range(days, -1, -1)
    ]

    # In a historical replay, J itself may now have
    # available observations.
    real_yesterday = (
        datetime.now(PARIS).date()
        - timedelta(days=1)
    )

    last_observed = min(
        origin_day,
        real_yesterday,
    )

    observed = [
        day for day in targets
        if day <= last_observed
    ]

    failures = []

    LOG.info(
        "BACKFILL START | J=%s | raw=%s..%s "
        "| targets=%s..%s | write=%s",
        origin_day,
        observed[0] if observed else "-",
        observed[-1] if observed else "-",
        targets[0],
        targets[-1],
        write,
    )

    # 1. Repair all historical raw observations.
    for day in observed:
        try:
            retry(
                lambda day=day: repair_observations(
                    day, write=write
                ),
                f"RAW {day}",
                attempts,
            )
        except Exception as exc:
            failures.append(
                ("RAW", str(day), str(exc))
            )
            LOG.exception("RAW FAILED %s", day)

    # 2. Repair all historical RTE forecasts.
    for day in targets:
        try:
            retry(
                lambda day=day: repair_rte(
                    day, write=write
                ),
                f"RTE {day}",
                attempts,
            )
        except Exception as exc:
            failures.append(
                ("RTE", str(day), str(exc))
            )
            LOG.exception("RTE FAILED %s", day)

    # 3. Freeze features, oldest to newest.
    for day in targets:
        try:
            retry(
                lambda day=day: repair_features(
                    day, write=write
                ),
                f"FEATURES {day}",
                attempts,
            )
        except Exception as exc:
            failures.append(
                ("FEATURES", str(day), str(exc))
            )
            LOG.exception("FEATURES FAILED %s", day)

    # 4. Complete predictions independently.
    for day in targets:
        for model in MODELS:
            try:
                missing = missing_predictions(
                    model, day
                )

                LOG.info(
                    "PRED %s %s | missing=%d",
                    day, model, missing,
                )

                if (
                    missing == 0
                    or not write
                    or infer is None
                ):
                    continue

                if (
                    model != "sarima"
                    and not features_ready(day)
                ):
                    raise RuntimeError(
                        "Target features incomplete"
                    )

                infer(model, day)

                remaining = missing_predictions(
                    model, day
                )

                if remaining:
                    raise RuntimeError(
                        f"{remaining} forecast hours still missing"
                    )

                LOG.info(
                    "PRED %s %s | completed",
                    day, model,
                )

            except Exception as exc:
                failures.append(
                    (model.upper(), str(day), str(exc))
                )

                LOG.error(
                    "PRED FAILED %s %s | %s",
                    day, model, exc,
                )

    LOG.info(
        "BACKFILL END | failures=%d",
        len(failures),
    )

    for phase, day, error in failures:
        LOG.warning(
            "UNRESOLVED | %s | %s | %s",
            phase, day, error,
        )

    return {
        "failures": failures,
        "targets": targets,
    }
