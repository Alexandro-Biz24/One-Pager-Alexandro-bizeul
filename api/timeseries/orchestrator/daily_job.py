
from __future__ import annotations

import argparse
import logging
import time

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

from timeseries.pipeline.clock import paris_hours
from timeseries.pipeline.daily_facts import run_day as prepare_day
from timeseries.pipeline.store import connect, init_tables

from timeseries.statistical.predict_sarima import (
    predict_sarima,
    init_prediction_table as init_sarima_table,
)
from timeseries.ml.predict_lightgbm import (
    predict_lightgbm,
    init_prediction_table as init_lightgbm_table,
)
from timeseries.dl.predict_mtst import (
    predict_day as predict_mtst,
    init_prediction_table as init_mtst_table,
)


PARIS = ZoneInfo("Europe/Paris")
LOG = logging.getLogger("timeseries.orchestrator")

LOOKBACK_DAYS = 7
MAX_RETRIES = 3
RETRY_DELAY = 2

ML_FEATURES = (
    "target_hour",
    "target_day_of_week",
    "target_month",
    "prediction_d1",
    "rte_error_lag_48h",
    "hdd_48h",
    "cdd_48h",
    "calendar_amplify_ewa",
)

TABLES = {
    "sarima": "sarima_predictions",
    "lightgbm": "lightgbm_predictions",
    "mtst": "mtst_predictions",
}


def today_paris() -> date:
    return datetime.now(PARIS).date()


def valid_hours(day: date) -> pd.DatetimeIndex:
    """Expected forecast timestamps, indexed in UTC."""
    hours = paris_hours(day)
    local = hours.tz_convert(PARIS).tz_localize(None)

    # Autumn DST: exclude the first repeated 02:00.
    return hours[~local.duplicated(keep="last")]


def retry(operation, label, attempts=MAX_RETRIES, delay=RETRY_DELAY):
    """Finite retries. Raises after the final failure."""
    if attempts < 1:
        raise ValueError("attempts must be >= 1")

    for attempt in range(1, attempts + 1):
        try:
            return operation()
        except Exception as exc:
            LOG.warning(
                "%s | attempt %d/%d | %s",
                label, attempt, attempts, exc,
            )
            if attempt == attempts:
                raise
            time.sleep(delay * attempt)


def initialize_database():
    """Ensure the required tables exist."""
    init_tables()

    with connect() as db:
        init_sarima_table(db)
        init_lightgbm_table(db)

    init_mtst_table()


def missing_predictions(model: str, target_day: date):
    """Return missing prediction UTC timestamps for one model/day."""
    if model not in TABLES:
        raise ValueError(f"Unknown model: {model}")

    expected = valid_hours(target_day)
    table = TABLES[model]

    with connect() as db:
        with db.cursor() as cur:
            cur.execute(
                f"""
                SELECT utc
                FROM {table}
                WHERE utc >= %s AND utc < %s
                  AND prediction_mw IS NOT NULL
                  AND lower_95_mw IS NOT NULL
                  AND upper_95_mw IS NOT NULL
                """,
                (
                    expected.min().to_pydatetime(),
                    (expected.max() + pd.Timedelta(hours=1)).to_pydatetime(),
                ),
            )
            rows = cur.fetchall()

    stored = pd.DatetimeIndex(
        pd.to_datetime([row[0] for row in rows], utc=True)
    )

    return expected.difference(stored)


def features_ready(target_day: date) -> bool:
    """Verify frozen, complete target features for LightGBM/MTST."""
    expected = valid_hours(target_day)

    columns = (
        "utc",
        "features_frozen_at",
        *ML_FEATURES,
    )

    with connect() as db:
        with db.cursor() as cur:
            cur.execute(
                f"""
                SELECT {", ".join(columns)}
                FROM hourly_data
                WHERE utc >= %s AND utc < %s
                ORDER BY utc
                """,
                (
                    expected.min().to_pydatetime(),
                    (expected.max() + pd.Timedelta(hours=1)).to_pydatetime(),
                ),
            )
            rows = cur.fetchall()

    if len(rows) != len(expected):
        return False

    frame = pd.DataFrame(rows, columns=columns)
    frame["utc"] = pd.to_datetime(frame["utc"], utc=True)
    frame = frame.set_index("utc").reindex(expected)

    return bool(frame.notna().all().all())


def run_inference(model: str, target_day: date):
    """Call the real inference API of each model."""
    origin_day = target_day - timedelta(days=1)

    if model == "sarima":
        return predict_sarima(
            run_day=origin_day,
            write=True,
        )

    if model == "lightgbm":
        return predict_lightgbm(
            run_day=origin_day,
            write=True,
        )

    if model == "mtst":
        return predict_mtst(
            day=target_day,
            write=True,
        )

    raise ValueError(f"Unknown model: {model}")


def process_model(model, target_day, attempts, delay):
    """One model/day; failures never block the other models."""
    result = {
        "day": str(target_day),
        "model": model,
        "status": None,
        "missing_before": None,
        "missing_after": None,
        "error": None,
    }

    try:
        before = missing_predictions(model, target_day)
        result["missing_before"] = len(before)

        if len(before) == 0:
            result["status"] = "ALREADY_COMPLETE"
            result["missing_after"] = 0
            return result

        # SARIMA only needs observed historical load.
        if model != "sarima" and not features_ready(target_day):
            result["status"] = "FEATURES_MISSING"
            result["missing_after"] = len(before)
            return result

        retry(
            lambda: run_inference(model, target_day),
            label=f"{model} {target_day}",
            attempts=attempts,
            delay=delay,
        )

        after = missing_predictions(model, target_day)
        result["missing_after"] = len(after)
        result["status"] = (
            "COMPLETED" if len(after) == 0 else "PARTIAL"
        )

    except Exception as exc:
        result["status"] = "FAILED"
        result["error"] = f"{type(exc).__name__}: {exc}"

        LOG.exception("Inference failed: %s %s", model, target_day)

        try:
            result["missing_after"] = len(
                missing_predictions(model, target_day)
            )
        except Exception:
            pass

    return result


def process_data(origin_day, attempts, delay):
    """Fetch missing raw observations and freeze J+1 features."""
    target_day = origin_day + timedelta(days=1)

    try:
        retry(
            lambda: prepare_day(origin_day, dry_run=False),
            label=f"Data/features {target_day}",
            attempts=attempts,
            delay=delay,
        )

        ready = features_ready(target_day)

        return {
            "day": str(target_day),
            "status": "READY" if ready else "INCOMPLETE",
            "error": None,
        }

    except Exception as exc:
        LOG.exception("Data preparation failed: %s", target_day)

        return {
            "day": str(target_day),
            "status": "FAILED",
            "error": f"{type(exc).__name__}: {exc}",
        }


def run_daily_pipeline(
    origin_day: date | None = None,
    *,
    lookback_days: int = LOOKBACK_DAYS,
    max_retries: int = MAX_RETRIES,
    delay: float = RETRY_DELAY,
    update_data: bool = True,
    write: bool = False,
):
    """
    Daily forecasting and bounded catch-up.

    write=False: read-only coverage audit.
    write=True: fetch/freeze data and insert missing predictions.
    """
    if lookback_days < 0:
        raise ValueError("lookback_days must be >= 0")

    origin_day = origin_day or today_paris()
    target_day = origin_day + timedelta(days=1)

    days = [target_day] + [
        origin_day - timedelta(days=i)
        for i in range(lookback_days)
    ]

    LOG.info(
        "PIPELINE | origin=%s | target=%s | write=%s",
        origin_day, target_day, write,
    )

    started_at = datetime.now(PARIS)

    data_results = []
    prediction_results = []

    if write:
        initialize_database()

    # Priority: current J+1, then recent history.
    for day in days:
        LOG.info("Processing target day %s", day)

        if write and update_data:
            # Each target day has its own origin (target - 1).
            data_results.append(
                process_data(
                    day - timedelta(days=1),
                    max_retries,
                    delay,
                )
            )

        for model in TABLES:
            if write:
                result = process_model(
                    model,
                    day,
                    max_retries,
                    delay,
                )
            else:
                try:
                    missing = missing_predictions(model, day)
                    result = {
                        "day": str(day),
                        "model": model,
                        "status": (
                            "ALREADY_COMPLETE"
                            if len(missing) == 0
                            else "MISSING"
                        ),
                        "missing_before": len(missing),
                        "missing_after": len(missing),
                        "error": None,
                    }
                except Exception as exc:
                    result = {
                        "day": str(day),
                        "model": model,
                        "status": "FAILED",
                        "missing_before": None,
                        "missing_after": None,
                        "error": str(exc),
                    }

            prediction_results.append(result)

            LOG.info(
                "%s | %s | %s | missing=%s",
                day,
                model,
                result["status"],
                result["missing_after"],
            )

    predictions = pd.DataFrame(prediction_results)
    data = pd.DataFrame(data_results)

    # Final coverage check: actual Neon state.
    coverage = []
    for day in days:
        for model in TABLES:
            try:
                missing = len(missing_predictions(model, day))
                coverage.append({
                    "day": str(day),
                    "model": model,
                    "missing_hours": missing,
                    "complete": missing == 0,
                    "error": None,
                })
            except Exception as exc:
                coverage.append({
                    "day": str(day),
                    "model": model,
                    "missing_hours": None,
                    "complete": False,
                    "error": str(exc),
                })

    coverage = pd.DataFrame(coverage)

    current = coverage[coverage["day"] == str(target_day)]

    current_complete = (
        len(current) == len(TABLES)
        and bool(current["complete"].all())
    )

    status = "COMPLETED" if current_complete else "INCOMPLETE"

    duration = (
        datetime.now(PARIS) - started_at
    ).total_seconds()

    LOG.info(
        "PIPELINE %s | %.1fs | incomplete=%d",
        status,
        duration,
        int((~coverage["complete"]).sum()),
    )

    return {
        "origin_day": origin_day,
        "target_day": target_day,
        "status": status,
        "duration_seconds": round(duration, 2),
        "data_results": data,
        "prediction_results": predictions,
        "coverage": coverage,
    }


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--day",
        type=date.fromisoformat,
        default=None,
        help="Forecast origin J (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--lookback-days",
        type=int,
        default=LOOKBACK_DAYS,
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=MAX_RETRIES,
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=RETRY_DELAY,
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Enable Neon writes and external data fetch",
    )
    parser.add_argument(
        "--skip-data-update",
        action="store_true",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )

    summary = run_daily_pipeline(
        origin_day=args.day,
        lookback_days=args.lookback_days,
        max_retries=args.max_retries,
        delay=args.delay,
        update_data=not args.skip_data_update,
        write=args.write,
    )

    print("\nDATA RESULTS")
    if not summary["data_results"].empty:
        print(summary["data_results"].to_string(index=False))

    print("\nPREDICTION RESULTS")
    print(summary["prediction_results"].to_string(index=False))

    print("\nFINAL COVERAGE")
    print(summary["coverage"].to_string(index=False))

    print("\nSTATUS:", summary["status"])

    if summary["status"] != "COMPLETED":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
