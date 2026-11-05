
"""Daily Timeseries coordinator: backfill, then J+1."""

from __future__ import annotations

import argparse
import logging
import subprocess
import sys

from datetime import date, datetime, timedelta

from timeseries.pipeline.clock import PARIS

from timeseries.orchestrator.backfill import (
    MODELS,
    features_ready,
    missing_predictions,
    repair_observations,
    repair_rte,
    repair_features,
    retry,
    run_backfill,
)

LOG = logging.getLogger("timeseries.daily")


# ==========================================================
# ISOLATED MODEL INFERENCE
# ==========================================================

def run_model_in_child(
    model: str,
    target_day: date,
    *,
    timeout: int = 180,
    mtst_device: str = "cpu",
    attempts: int = 2,
):
    """
    Run each inference in an isolated subprocess.

    Prevent a native PyTorch crash or hung model
    from blocking the entire orchestrator.
    """

    cmd = [
        sys.executable,
        "-u",
        "-m",
        "timeseries.orchestrator.daily_run",
        "--single-model",
        model,
        "--target-day",
        target_day.isoformat(),
        "--mtst-device",
        mtst_device,
    ]

    for attempt in range(1, attempts + 1):

        LOG.info(
            "INFER %s %s | attempt=%d/%d | timeout=%ds",
            model,
            target_day,
            attempt,
            attempts,
            timeout,
        )

        try:
            subprocess.run(
                cmd,
                check=True,
                timeout=timeout,
            )
            return

        except (
            subprocess.TimeoutExpired,
            subprocess.CalledProcessError,
        ) as exc:

            LOG.error(
                "INFER %s %s | attempt %d failed: %s",
                model,
                target_day,
                attempt,
                exc,
            )

            if attempt == attempts:
                raise


def predict_single(
    model: str,
    target_day: date,
    *,
    mtst_device: str = "cpu",
):

    origin_day = target_day - timedelta(days=1)

    if model == "sarima":

        from timeseries.statistical.predict_sarima import (
            predict_sarima,
        )

        return predict_sarima(
            run_day=origin_day,
            write=True,
        )

    if model == "lightgbm":

        from timeseries.ml.predict_lightgbm import (
            predict_lightgbm,
        )

        return predict_lightgbm(
            run_day=origin_day,
            write=True,
        )

    if model == "mtst":

        from timeseries.dl.predict_mtst import (
            predict_day,
        )

        return predict_day(
            day=target_day,
            device=mtst_device,
            write=True,
        )

    raise ValueError(f"Unknown model: {model}")


# ==========================================================
# DAILY PIPELINE
# ==========================================================

def run_daily(
    origin_day: date,
    *,
    lookback_days: int = 7,
    write: bool = False,
    attempts: int = 3,
    model_attempts: int = 2,
    model_timeout: int = 180,
    mtst_device: str = "cpu",
    skip_backfill: bool = False,
) -> dict:

    failures = []

    target = origin_day + timedelta(days=1)

    LOG.info(
        "START | J=%s | J+1=%s | write=%s "
        "| backfill=%d days",
        origin_day,
        target,
        write,
        lookback_days,
    )

    # ------------------------------------------
    # Initialize Neon tables when writing.
    # ------------------------------------------

    if write:

        from timeseries.pipeline.store import (
            init_tables,
            connect,
        )

        from timeseries.statistical.predict_sarima import (
            init_prediction_table as init_sarima,
        )

        from timeseries.ml.predict_lightgbm import (
            init_prediction_table as init_lgbm,
        )

        from timeseries.dl.predict_mtst import (
            init_prediction_table as init_mtst,
        )

        init_tables()

        with connect() as db:
            init_sarima(db)
            init_lgbm(db)

        init_mtst()

    # All models use the same subprocess wrapper.
    def infer(model, day):
        return run_model_in_child(
            model,
            day,
            timeout=model_timeout,
            mtst_device=mtst_device,
            attempts=model_attempts,
        )

    # ======================================================
    # STEP A — BACKFILL J-7 -> J
    # ======================================================

    if not skip_backfill:

        result = run_backfill(
            origin_day,
            days=lookback_days,
            write=write,
            attempts=attempts,
            infer=infer,
        )

        failures.extend(result["failures"])

    # ======================================================
    # STEP B — DAILY PREPARATION J+1
    # ======================================================

    LOG.info(
        "DAILY START | origin=%s | target=%s",
        origin_day,
        target,
    )

    yesterday = origin_day - timedelta(days=1)

    steps = (
        (
            "RAW",
            lambda: repair_observations(
                yesterday, write=write
            ),
        ),
        (
            "RTE",
            lambda: repair_rte(
                target, write=write
            ),
        ),
        (
            "FEATURES",
            lambda: repair_features(
                target, write=write
            ),
        ),
    )

    for label, fn in steps:

        try:
            retry(
                fn,
                f"DAILY {label} {target}",
                attempts,
            )

        except Exception as exc:

            failures.append(
                (label, str(target), str(exc))
            )

            LOG.error(
                "DAILY %s %s | FAILED: %s",
                label,
                target,
                exc,
            )

    # ======================================================
    # STEP C — DAILY INFERENCE J+1
    # ======================================================

    for model in MODELS:

        try:

            missing = missing_predictions(
                model, target
            )

            LOG.info(
                "DAILY %s | %s | missing=%d",
                target,
                model,
                missing,
            )

            if missing == 0:
                continue

            if not write:
                continue

            if (
                model != "sarima"
                and not features_ready(target)
            ):
                raise RuntimeError(
                    "Target features missing"
                )

            infer(model, target)

            remaining = missing_predictions(
                model, target
            )

            if remaining:
                raise RuntimeError(
                    f"{remaining} predictions still missing"
                )

            LOG.info(
                "DAILY %s %s | COMPLETE",
                target,
                model,
            )

        except Exception as exc:

            failures.append(
                (model.upper(), str(target), str(exc))
            )

            LOG.error(
                "DAILY %s %s | FAILED: %s",
                target,
                model,
                exc,
            )

    # ======================================================
    # STEP D — FINAL AUDIT
    # ======================================================

    historical_days = (
        [
            origin_day - timedelta(days=i)
            for i in range(lookback_days, -1, -1)
        ]
        if not skip_backfill
        else []
    )

    for day in historical_days + [target]:

        for model in MODELS:

            try:

                missing = missing_predictions(
                    model, day
                )

                LOG.info(
                    "AUDIT | %s | %s | missing=%d",
                    day,
                    model,
                    missing,
                )

                if missing:
                    failures.append((
                        "AUDIT",
                        str(day),
                        f"{model}: {missing} missing",
                    ))

            except Exception as exc:

                failures.append((
                    "AUDIT",
                    str(day),
                    f"{model}: {exc}",
                ))

    LOG.info(
        "END | J=%s | unresolved=%d",
        origin_day,
        len(failures),
    )

    for phase, day, error in failures:

        LOG.warning(
            "UNRESOLVED | %s | %s | %s",
            phase,
            day,
            error,
        )

    return {
        "failures": failures,
        "target_day": target,
    }


# ==========================================================
# CLI
# ==========================================================

def main():

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--day",
        type=date.fromisoformat,
        default=datetime.now(PARIS).date(),
    )

    parser.add_argument(
        "--lookback-days",
        type=int,
        default=7,
    )

    parser.add_argument(
        "--write",
        action="store_true",
    )

    parser.add_argument(
        "--max-retries",
        type=int,
        default=3,
    )

    parser.add_argument(
        "--model-attempts",
        type=int,
        default=2,
    )

    parser.add_argument(
        "--model-timeout",
        type=int,
        default=180,
    )

    parser.add_argument(
        "--mtst-device",
        default="cpu",
    )

    parser.add_argument(
        "--skip-backfill",
        action="store_true",
    )

    # Internal subprocess arguments.
    parser.add_argument(
        "--single-model",
        choices=MODELS,
    )

    parser.add_argument(
        "--target-day",
        type=date.fromisoformat,
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format=(
            "%(asctime)s | %(levelname)s | %(message)s"
        ),
        stream=sys.stdout,
    )

    if args.single_model:

        if not args.target_day:
            parser.error(
                "--single-model needs --target-day"
            )

        predict_single(
            args.single_model,
            args.target_day,
            mtst_device=args.mtst_device,
        )
        return

    result = run_daily(
        args.day,
        lookback_days=args.lookback_days,
        write=args.write,
        attempts=args.max_retries,
        model_attempts=args.model_attempts,
        model_timeout=args.model_timeout,
        mtst_device=args.mtst_device,
        skip_backfill=args.skip_backfill,
    )

    if result["failures"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
