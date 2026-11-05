
"""Timeseries API: public Neon reads and protected pipeline trigger."""

from __future__ import annotations

import logging
import os
import secrets

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

from fastapi import (
    APIRouter,
    Header,
    HTTPException,
    Query,
)
from pydantic import BaseModel, Field

from timeseries.pipeline.clock import day_bounds
from timeseries.pipeline.store import connect


router = APIRouter()
LOG = logging.getLogger("timeseries.router")

PARIS = ZoneInfo("Europe/Paris")

MODELS = [
    {"id": "statistical", "label": "Statistical", "model": "sarima"},
    {"id": "ml", "label": "Machine learning", "model": "lightgbm"},
    {"id": "dl", "label": "Deep learning", "model": "mtst"},
]

MODEL_NAMES = ("sarima", "lightgbm", "mtst")

MODEL_ALIASES = {
    "statistical": "sarima",
    "ml": "lightgbm",
    "dl": "mtst",
}


# ==========================================================
# GENERAL
# ==========================================================

@router.get("")
def overview():
    return {
        "feature": "timeseries",
        "timezone": "Europe/Paris",
        "models": MODELS,
        "endpoints": {
            "series": "/timeseries/series",
            "run": "/timeseries/run",
        },
    }


# ==========================================================
# GET /timeseries/series
# ==========================================================

def selected_models(value: str) -> list[str]:
    value = value.strip().lower()

    if value in ("all", "*"):
        return list(MODEL_NAMES)

    names = []

    for item in value.split(","):
        item = item.strip()
        model = MODEL_ALIASES.get(item, item)

        if model not in MODEL_NAMES:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown model: {item}",
            )

        if model not in names:
            names.append(model)

    if not names:
        raise HTTPException(
            status_code=422,
            detail="Select at least one model.",
        )

    return names


def optional_float(value):
    if value is None or pd.isna(value):
        return None
    return float(value)



@router.get("/series")
def get_series(
    start: date = Query(
        ...,
        description="First French-local day, inclusive",
    ),
    end: date = Query(
        ...,
        description="Last French-local day, inclusive",
    ),
    models: str = Query(
        "all",
        description="all, sarima, lightgbm, mtst, or comma-separated",
    ),
):
    if end < start:
        raise HTTPException(
            status_code=422,
            detail="end must be >= start",
        )

    if (end - start).days > 3650:
        raise HTTPException(
            status_code=422,
            detail="Maximum period is 10 years.",
        )

    chosen = selected_models(models)

    # French-local date boundaries.
    # start is inclusive, end is inclusive at the API level.
    # SQL upper bound is exclusive.
    start_utc, _ = day_bounds(start)
    _, end_utc = day_bounds(end)

    with connect() as db:
        rows = db.execute(
            """
            SELECT
                h.utc,
                h.load,
                h.temperature,
                h.prediction_d1,

                s.prediction_mw,
                s.lower_95_mw,
                s.upper_95_mw,

                l.prediction_mw,
                l.lower_95_mw,
                l.upper_95_mw,

                m.prediction,
                m.lower_95,
                m.upper_95

            FROM hourly_data AS h

            LEFT JOIN sarima_predictions AS s
                ON s.utc = h.utc

            LEFT JOIN lightgbm_predictions AS l
                ON l.utc = h.utc

            LEFT JOIN mtst_predictions AS m
                ON m.utc = h.utc

            WHERE h.utc >= %s
              AND h.utc < %s

            ORDER BY h.utc
            """,
            (
                start_utc,
                end_utc,
            ),
        ).fetchall()

    # Exclude the first repeated 02:00 during autumn DST.
    if rows:
        timestamps = pd.DatetimeIndex(
            pd.to_datetime(
                [row[0] for row in rows],
                utc=True,
            )
        )

        local_clock = (
            timestamps
            .tz_convert(PARIS)
            .tz_localize(None)
        )

        valid = ~local_clock.duplicated(
            keep="last"
        )

        rows = [
            row
            for row, keep in zip(rows, valid)
            if keep
        ]

    points = []

    for row in rows:
        (
            utc,
            load,
            temperature,
            rte,
            sarima_pred,
            sarima_lower,
            sarima_upper,
            lgbm_pred,
            lgbm_lower,
            lgbm_upper,
            mtst_pred,
            mtst_lower,
            mtst_upper,
        ) = row

        utc = pd.Timestamp(utc).tz_convert("UTC")
        local = utc.tz_convert(PARIS)

        forecasts = {
            "sarima": (
                sarima_pred,
                sarima_lower,
                sarima_upper,
            ),
            "lightgbm": (
                lgbm_pred,
                lgbm_lower,
                lgbm_upper,
            ),
            "mtst": (
                mtst_pred,
                mtst_lower,
                mtst_upper,
            ),
        }

        predictions = {}

        for model in chosen:
            pred, lower, upper = forecasts[model]

            predictions[model] = {
                "prediction": optional_float(pred),
                "lower_95": optional_float(lower),
                "upper_95": optional_float(upper),
            }

        points.append({
            "utc": utc.isoformat(),
            "local_time": local.isoformat(),
            "load": optional_float(load),
            "temperature": optional_float(temperature),
            "rte": optional_float(rte),
            "predictions": predictions,
        })

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "timezone": "Europe/Paris",
        "models": chosen,
        "count": len(points),
        "data": points,
    }



# ==========================================================
# POST /timeseries/run
# ==========================================================

class RunRequest(BaseModel):
    day: date | None = None
    lookback_days: int = Field(
        default=7,
        ge=0,
        le=7,
    )
    write: bool = True


@router.post("/run")
def trigger_pipeline(
    request: RunRequest,
    x_cron_secret: str | None = Header(
        default=None,
        alias="X-Cron-Secret",
    ),
):
    """
    Protected manual trigger.

    Render Cron should normally call the Python CLI
    directly, not this HTTP endpoint.
    """

    expected_secret = os.environ.get(
        "TIMESERIES_CRON_SECRET",
        "",
    )

    if not expected_secret:
        raise HTTPException(
            status_code=503,
            detail="Pipeline trigger not configured.",
        )

    if (
        not x_cron_secret
        or not secrets.compare_digest(
            x_cron_secret,
            expected_secret,
        )
    ):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized",
        )

    from timeseries.orchestrator.daily_run import (
        run_daily,
    )

    origin_day = (
        request.day
        or datetime.now(PARIS).date()
    )

    if origin_day > datetime.now(PARIS).date():
        raise HTTPException(
            status_code=422,
            detail="Future origin days are not allowed.",
        )

    LOG.info(
        "API pipeline trigger | day=%s | write=%s",
        origin_day,
        request.write,
    )

    try:
        result = run_daily(
            origin_day=origin_day,
            lookback_days=request.lookback_days,
            write=request.write,
            mtst_device="cpu",
        )

    except Exception:
        LOG.exception(
            "Pipeline execution failed"
        )
        raise HTTPException(
            status_code=500,
            detail="Pipeline execution failed. Check server logs.",
        )

    failures = [
        {
            "step": phase,
            "day": day,
            "error": error,
        }
        for phase, day, error in result["failures"]
    ]

    return {
        "status": (
            "completed"
            if not failures
            else "incomplete"
        ),
        "origin_day": origin_day.isoformat(),
        "target_day": result["target_day"].isoformat(),
        "write": request.write,
        "unresolved": len(failures),
        "failures": failures,
    }
