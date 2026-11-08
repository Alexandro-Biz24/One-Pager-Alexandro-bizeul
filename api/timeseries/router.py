
"""Timeseries API: public Neon reads and protected pipeline trigger."""

from __future__ import annotations

import logging
import os
import secrets
from datetime import date, timedelta
from math import sqrt

import numpy as np
import pandas as pd
from fastapi import HTTPException, Query
from statsmodels.stats.diagnostic import acorr_ljungbox
from statsmodels.tsa.stattools import adfuller

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


@router.get("/latest-day")
def get_latest_day(
    model: str = Query("sarima"),
):
    model_tables = {
        "sarima": ("sarima_predictions", "prediction_mw"),
        "lightgbm": ("lightgbm_predictions", "prediction_mw"),
        "mtst": ("mtst_predictions", "prediction"),
    }

    if model not in model_tables:
        raise HTTPException(
            status_code=422,
            detail="Invalid model",
        )

    table, prediction_column = model_tables[model]

    with connect() as db:
        row = db.execute(
            f"""
            SELECT
                (p.utc AT TIME ZONE 'Europe/Paris')::date
            FROM {table} AS p
            JOIN hourly_data AS h
                ON h.utc = p.utc
            WHERE p.{prediction_column} IS NOT NULL
              AND h.prediction_d1 IS NOT NULL
            ORDER BY p.utc DESC
            LIMIT 1
            """
        ).fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"No available forecast for {model}",
        )

    return {
        "model": model,
        "latest_day": row[0].isoformat(),
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

    start_utc, _ = day_bounds(start)
    _, end_utc = day_bounds(end)

    with connect() as db:
        rows = db.execute(
            """
            SELECT
                h.utc,
                h.tz_fr,
                h.load,
                h.temperature,
                h.prediction_d1,
                h.rte_lower_95,
                h.rte_upper_95,

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
            (start_utc, end_utc),
        ).fetchall()

    # Exclude the first repeated 02:00 in autumn.
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
            tz_fr,
            load,
            temperature,
            rte,
            rte_lower,
            rte_upper,
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
            "rte_lower_95": optional_float(rte_lower),
            "rte_upper_95": optional_float(rte_upper),
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



MODEL_SQL = {
    "sarima": {
        "label": "SARIMA",
        "table": "sarima_predictions",
        "pred": "prediction_mw",
        "lower": "lower_95_mw",
        "upper": "upper_95_mw",
    },
    "lightgbm": {
        "label": "LightGBM",
        "table": "lightgbm_predictions",
        "pred": "prediction_mw",
        "lower": "lower_95_mw",
        "upper": "upper_95_mw",
    },
    "mtst": {
        "label": "MTST",
        "table": "mtst_predictions",
        "pred": "prediction",
        "lower": "lower_95",
        "upper": "upper_95",
    },
}


def _safe_float(value):
    if value is None:
        return None
    try:
        value = float(value)
    except Exception:
        return None
    if not np.isfinite(value):
        return None
    return value


def _r2_score(y_true: np.ndarray, y_pred: np.ndarray) -> float | None:
    if len(y_true) == 0:
        return None
    ss_res = float(np.sum((y_true - y_pred) ** 2))
    ss_tot = float(np.sum((y_true - y_true.mean()) ** 2))
    if ss_tot == 0:
        return None
    return 1.0 - ss_res / ss_tot


def _compute_metrics(
    actual: np.ndarray,
    pred: np.ndarray,
    lower: np.ndarray,
    upper: np.ndarray,
):
    if len(actual) == 0:
        return {
            "mae": None,
            "rmse": None,
            "mape": None,
            "r2": None,
            "coverage_95": None,
            "mean_width": None,
            "interval_failures": None,
            "ape_above_5": None,
        }

    abs_error = np.abs(actual - pred)
    ape = np.where(actual != 0, abs_error / np.abs(actual), np.nan)

    inside = (actual >= lower) & (actual <= upper)
    coverage = float(np.mean(inside) * 100.0)
    width = upper - lower

    return {
        "mae": float(np.mean(abs_error)),
        "rmse": float(sqrt(np.mean((actual - pred) ** 2))),
        "mape": float(np.nanmean(ape) * 100.0),
        "r2": _r2_score(actual, pred),
        "coverage_95": coverage,
        "mean_width": float(np.mean(width)),
        "interval_failures": float(100.0 - coverage),
        "ape_above_5": float(np.nanmean(ape > 0.05) * 100.0),
    }


def _residual_test_pvalues(errors: np.ndarray):
    errors = np.asarray(errors, dtype=float)
    errors = errors[np.isfinite(errors)]

    if len(errors) < 50:
        return {
            "adf_pvalue": None,
            "ljung_box_pvalue": None,
        }

    lag = min(24, len(errors) // 5)

    try:
        adf_pvalue = float(
            adfuller(
                errors,
                maxlag=lag,
                autolag=None,
                regression="c",
                result_object=False,
            )[1]
        )
    except (ValueError, np.linalg.LinAlgError):
        adf_pvalue = None

    try:
        lb = acorr_ljungbox(
            errors,
            lags=[lag],
            return_df=True,
        )
        ljung_box_pvalue = float(
            lb["lb_pvalue"].iloc[0]
        )
    except (ValueError, np.linalg.LinAlgError):
        ljung_box_pvalue = None

    return {
        "adf_pvalue": adf_pvalue,
        "ljung_box_pvalue": ljung_box_pvalue,
    }


def _build_weekly_points(
    frame: pd.DataFrame,
    pred_col: str,
    lower_col: str,
    upper_col: str,
):
    points = []

    for row in frame.itertuples(index=False):
        load = float(row.load)
        pred = float(getattr(row, pred_col))
        lower = float(getattr(row, lower_col))
        upper = float(getattr(row, upper_col))

        ape = None
        if load != 0:
            ape = abs(load - pred) / abs(load) * 100.0

        outside = load < lower or load > upper
        above_5 = ape is not None and ape > 5.0

        points.append(
            {
                "utc": pd.Timestamp(row.utc).isoformat(),
                "local_time": pd.Timestamp(row.local_time).isoformat(),
                "load": load,
                "prediction": pred,
                "lower_95": lower,
                "upper_95": upper,
                "outside_interval": outside,
                "ape_gt_5": above_5,
                "ape_percent": _safe_float(ape),
            }
        )

    return points


@router.get("/statistics")
def get_statistics(
    model: str = Query(
        "sarima",
        description="sarima, lightgbm or mtst",
    ),
    period: str = Query(
        "today",
        description="today or custom",
    ),
    start: date | None = Query(
        None,
        description="Custom start day, inclusive",
    ),
    end: date | None = Query(
        None,
        description="Custom end day, inclusive",
    ),
):
    model = model.lower().strip()

    if model not in MODEL_SQL:
        raise HTTPException(
            status_code=422,
            detail="model must be one of: sarima, lightgbm, mtst",
        )

    period = period.lower().strip()

    if period not in {"today", "custom"}:
        raise HTTPException(
            status_code=422,
            detail="period must be 'today' or 'custom'",
        )

    if period == "custom":
        if start is None or end is None:
            raise HTTPException(
                status_code=422,
                detail="start and end are required when period=custom",
            )
        if end < start:
            raise HTTPException(
                status_code=422,
                detail="end must be >= start",
            )
    else:
        # Full available evaluation history from the project start.
        start = date(2024, 4, 1)
        end = date.today()

    config = MODEL_SQL[model]

    start_utc, _ = day_bounds(start)
    end_plus_one = end + timedelta(days=1)
    end_utc, _ = day_bounds(end_plus_one)

    query = f"""
        SELECT
            h.utc,
            h.load,
            h.prediction_d1,
            h.rte_lower_95,
            h.rte_upper_95,
            p.{config["pred"]} AS model_prediction,
            p.{config["lower"]} AS model_lower_95,
            p.{config["upper"]} AS model_upper_95
        FROM hourly_data AS h
        LEFT JOIN {config["table"]} AS p
            ON p.utc = h.utc
        WHERE h.utc >= %s
          AND h.utc < %s
        ORDER BY h.utc
    """

    with connect() as db:
        rows = db.execute(
            query,
            (
                start_utc,
                end_utc,
            ),
        ).fetchall()

    if not rows:
        return {
            "model": model,
            "model_label": config["label"],
            "period": period,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "n": 0,
            "results": [],
            "weekly_window": {
                "title": "Weekly coverage and 5% relative-error threshold",
                "description": "No observations found for this period.",
                "start": None,
                "end": None,
                "count": 0,
                "charts": [],
                "message": "No data available.",
            },
            "residual_diagnostics": {
                "title": "Residual diagnostics",
                "description": "No residuals available.",
                "tests": [],
                "residuals": {
                    "rte": [],
                    "model": [],
                },
            },
        }

    df = pd.DataFrame(
        rows,
        columns=[
            "utc",
            "load",
            "prediction_d1",
            "rte_lower_95",
            "rte_upper_95",
            "model_prediction",
            "model_lower_95",
            "model_upper_95",
        ],
    )

    df["utc"] = pd.to_datetime(df["utc"], utc=True)
    df["local_time"] = df["utc"].dt.tz_convert(PARIS)
    df["local_day"] = df["local_time"].dt.date

    # Keep only rows where the true load and both compared forecasts are available.
    eval_mask = (
        df["load"].notna()
        & df["prediction_d1"].notna()
        & df["rte_lower_95"].notna()
        & df["rte_upper_95"].notna()
        & df["model_prediction"].notna()
        & df["model_lower_95"].notna()
        & df["model_upper_95"].notna()
    )

    eval_df = df.loc[eval_mask].copy()

    if eval_df.empty:
        return {
            "model": model,
            "model_label": config["label"],
            "period": period,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "n": 0,
            "results": [],
            "weekly_window": {
                "title": "Weekly coverage and 5% relative-error threshold",
                "description": (
                    "This visual highlights interval misses and "
                    "relative errors above 5% on a one-week sample."
                ),
                "start": None,
                "end": None,
                "count": 0,
                "charts": [],
                "message": (
                    "Observed load is not yet available for the selected period, "
                    "so this chart cannot be displayed."
                ),
            },
            "residual_diagnostics": {
                "title": "Residual diagnostics",
                "description": (
                    "ADF and Ljung–Box tests are computed on residuals "
                    "only when observed load is available."
                ),
                "tests": [],
                "residuals": {
                    "rte": [],
                    "model": [],
                },
            },
        }

    actual = eval_df["load"].to_numpy(dtype=float)

    rte_pred = eval_df["prediction_d1"].to_numpy(dtype=float)
    rte_lower = eval_df["rte_lower_95"].to_numpy(dtype=float)
    rte_upper = eval_df["rte_upper_95"].to_numpy(dtype=float)

    model_pred = eval_df["model_prediction"].to_numpy(dtype=float)
    model_lower = eval_df["model_lower_95"].to_numpy(dtype=float)
    model_upper = eval_df["model_upper_95"].to_numpy(dtype=float)

    results = [
        {
            "model": "RTE",
            **_compute_metrics(actual, rte_pred, rte_lower, rte_upper),
        },
        {
            "model": config["label"],
            **_compute_metrics(actual, model_pred, model_lower, model_upper),
        },
    ]

    # Weekly sample:
    if period == "custom":
        last_day = eval_df["local_day"].max()
        first_day = eval_df["local_day"].min()
        span_days = (last_day - first_day).days + 1

        if span_days <= 7:
            week_df = eval_df.copy()
        else:
            week_start = last_day - timedelta(days=6)
            week_df = eval_df.loc[eval_df["local_day"] >= week_start].copy()
    else:
        last_day = eval_df["local_day"].max()
        week_start = last_day - timedelta(days=6)
        week_df = eval_df.loc[eval_df["local_day"] >= week_start].copy()

    weekly_charts = []
    if not week_df.empty:
        weekly_charts = [
            {
                "key": "rte",
                "label": "RTE",
                "color": "#f08c28",
                "points": _build_weekly_points(
                    week_df,
                    pred_col="prediction_d1",
                    lower_col="rte_lower_95",
                    upper_col="rte_upper_95",
                ),
            },
            {
                "key": model,
                "label": config["label"],
                "color": "#1b7f8c",
                "points": _build_weekly_points(
                    week_df,
                    pred_col="model_prediction",
                    lower_col="model_lower_95",
                    upper_col="model_upper_95",
                ),
            },
        ]

    rte_errors = rte_pred - actual
    model_errors = model_pred - actual

    rte_tests = _residual_test_pvalues(rte_errors)
    model_tests = _residual_test_pvalues(model_errors)

    return {
        "model": model,
        "model_label": config["label"],
        "period": period,
        "start": str(eval_df["local_day"].min()),
        "end": str(eval_df["local_day"].max()),
        "n": int(len(eval_df)),
        "results": results,
        "weekly_window": {
            "title": "Weekly coverage and 5% relative-error threshold",
            "description": (
                "One-week visual audit of forecast reliability. "
                "Red markers indicate observations outside the 95% interval; "
                "orange markers indicate absolute percentage error above 5%."
            ),
            "start": str(week_df["local_day"].min()) if not week_df.empty else None,
            "end": str(week_df["local_day"].max()) if not week_df.empty else None,
            "count": int(len(week_df)),
            "charts": weekly_charts,
            "message": None if not week_df.empty else (
                "Observed load is not yet available for the selected period."
            ),
        },
        "residual_diagnostics": {
            "title": "Residual diagnostics",
            "description": (
                "Residual distributions are compared against RTE. "
                "ADF p-values assess stationarity; Ljung–Box p-values "
                "assess residual autocorrelation."
            ),
            "tests": [
                {
                    "model": "RTE",
                    **rte_tests,
                },
                {
                    "model": config["label"],
                    **model_tests,
                },
            ],
            "residuals": {
                "rte": [_safe_float(x) for x in rte_errors.tolist()],
                "model": [_safe_float(x) for x in model_errors.tolist()],
            },
        },
    }


# ============================================================
# INDEPENDENT STATISTICAL DASHBOARD ENDPOINTS
# ============================================================

from datetime import datetime, timedelta
import numpy as np
from statsmodels.stats.diagnostic import acorr_ljungbox
from statsmodels.tsa.stattools import adfuller

_DASHBOARD_MODELS = {
    "sarima": (
        "SARIMA",
        "sarima_predictions",
        "prediction_mw",
        "lower_95_mw",
        "upper_95_mw",
    ),
    "lightgbm": (
        "LightGBM",
        "lightgbm_predictions",
        "prediction_mw",
        "lower_95_mw",
        "upper_95_mw",
    ),
    "mtst": (
        "MTST",
        "mtst_predictions",
        "prediction",
        "lower_95",
        "upper_95",
    ),
}


def _dashboard_period(period, start, end, model):
    from timeseries.pipeline.clock import PARIS

    model = model.lower().strip()
    period = period.lower().strip()

    if model not in _DASHBOARD_MODELS:
        raise HTTPException(422, "Invalid model")

    if period == "today":
        start = date(2024, 4, 1)
        end = datetime.now(PARIS).date()

    elif period == "custom":
        if start is None or end is None or end < start:
            raise HTTPException(422, "Invalid custom period")
        if (end - start).days > 3650:
            raise HTTPException(422, "Maximum period is 10 years")

    else:
        raise HTTPException(422, "Invalid period")

    start_utc, _ = day_bounds(start)
    _, end_utc = day_bounds(end)

    return model, period, start, end, start_utc, end_utc


def _dashboard_rows(model, start_utc, end_utc, descending=False, limit=None):
    label, table, pred, lower, upper = _DASHBOARD_MODELS[model]

    query = f"""
        SELECT
            h.utc,
            h.load,
            h.prediction_d1,
            h.rte_lower_95,
            h.rte_upper_95,
            p.{pred},
            p.{lower},
            p.{upper}
        FROM hourly_data AS h
        JOIN {table} AS p ON p.utc = h.utc
        WHERE h.utc >= %s
          AND h.utc < %s
          AND h.load IS NOT NULL
          AND h.prediction_d1 IS NOT NULL
          AND h.rte_lower_95 IS NOT NULL
          AND h.rte_upper_95 IS NOT NULL
          AND p.{pred} IS NOT NULL
          AND p.{lower} IS NOT NULL
          AND p.{upper} IS NOT NULL
        ORDER BY h.utc {"DESC" if descending else "ASC"}
    """

    if limit is not None:
        query += f" LIMIT {int(limit)}"

    with connect() as db:
        rows = db.execute(
            query, (start_utc, end_utc)
        ).fetchall()

    return [
        row for row in rows
        if np.isfinite(np.asarray(row[1:], dtype=float)).all()
    ]


def _dashboard_metrics(y, pred, lower, upper):
    error = y - pred
    absolute = np.abs(error)

    nonzero = y != 0
    ape = 100 * absolute[nonzero] / np.abs(y[nonzero])

    covered = (y >= lower) & (y <= upper)

    ss_total = np.sum((y - y.mean()) ** 2)

    return {
        "mae": float(absolute.mean()),
        "rmse": float(np.sqrt(np.mean(error ** 2))),
        "mape": float(ape.mean()) if len(ape) else None,
        "r2": (
            float(1 - np.sum(error ** 2) / ss_total)
            if ss_total > 0 else None
        ),
        "coverage_95": float(100 * covered.mean()),
        "mean_width": float(np.mean(upper - lower)),
        "interval_failures": float(100 * (~covered).mean()),
        "ape_above_5": (
            float(100 * np.mean(ape > 5))
            if len(ape) else None
        ),
    }


@router.get("/statistics/summary")
def dashboard_summary(
    model: str = Query("sarima"),
    period: str = Query("today"),
    start: date | None = Query(None),
    end: date | None = Query(None),
):
    model, period, start, end, a, b = _dashboard_period(
        period, start, end, model
    )

    rows = _dashboard_rows(model, a, b)

    result = {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "n": len(rows),
        "results": [],
    }

    if not rows:
        return result

    values = np.asarray([row[1:] for row in rows], dtype=float)
    y = values[:, 0]

    rte = _dashboard_metrics(
        y, values[:, 1], values[:, 2], values[:, 3]
    )
    fitted = _dashboard_metrics(
        y, values[:, 4], values[:, 5], values[:, 6]
    )

    fields = (
        "mae", "rmse", "mape", "r2",
        "coverage_95", "mean_width",
        "interval_failures", "ape_above_5",
    )

    absolute = {}
    relative = {}

    for field in fields:
        r = rte[field]
        m = fitted[field]

        absolute[field] = (
            float(m - r)
            if r is not None and m is not None
            else None
        )

        relative[field] = (
            float(100 * (m - r) / abs(r))
            if r is not None and m is not None and r != 0
            else None
        )

    result["results"] = [
        {"model": "RTE", **rte},
        {"model": _DASHBOARD_MODELS[model][0], **fitted},
        {"model": "Absolute difference", **absolute},
        {"model": "Relative difference (%)", **relative},
    ]

    return result


@router.get("/statistics/weekly")
def dashboard_weekly(
    model: str = Query("sarima"),
    period: str = Query("today"),
    start: date | None = Query(None),
    end: date | None = Query(None),
):
    from timeseries.pipeline.clock import PARIS

    model, period, start, end, a, b = _dashboard_period(
        period, start, end, model
    )

    latest = _dashboard_rows(model, a, b, descending=True, limit=1)

    if not latest:
        return {
            "count": 0,
            "start": None,
            "end": None,
            "charts": [],
            "message": (
                "Observed load and complete forecasts are not "
                "yet available for this period."
            ),
        }

    last_day = latest[0][0].astimezone(PARIS).date()
    first_day = max(start, last_day - timedelta(days=6))
    week_start, _ = day_bounds(first_day)

    rows = _dashboard_rows(model, week_start, b)

    charts = []

    for name, p, lo, hi in (
        ("RTE", 2, 3, 4),
        (_DASHBOARD_MODELS[model][0], 5, 6, 7),
    ):
        points = []

        for row in rows:
            utc, actual = row[0], float(row[1])
            prediction = float(row[p])
            lower = float(row[lo])
            upper = float(row[hi])

            ape = (
                100 * abs(actual - prediction) / abs(actual)
                if actual != 0 else None
            )

            outside = actual < lower or actual > upper
            above_5 = ape is not None and ape > 5

            points.append({
                "utc": utc.isoformat(),
                "load": actual,
                "prediction": prediction,
                "interval": [lower, upper],
                "outside": actual if outside else None,
                "above_5": (
                    actual if above_5 and not outside else None
                ),
                "ape": ape,
            })

        charts.append({
            "label": name,
            "points": points,
        })

    return {
        "count": len(rows),
        "start": first_day.isoformat(),
        "end": last_day.isoformat(),
        "charts": charts,
        "message": None,
    }


def _dashboard_pvalues(errors):
    errors = np.asarray(errors, dtype=float)

    if len(errors) < 50:
        return {
            "adf_pvalue": None,
            "ljung_box_pvalue": None,
        }

    lag = min(24, len(errors) // 5)

    try:
        adf = float(adfuller(
            errors,
            maxlag=lag,
            autolag=None,
            regression="c",
            result_object=False,
        )[1])
    except (ValueError, np.linalg.LinAlgError):
        adf = None

    try:
        lb = acorr_ljungbox(
            errors,
            lags=[lag],
            return_df=True,
        )
        ljung_box = float(lb["lb_pvalue"].iloc[0])
    except (ValueError, np.linalg.LinAlgError):
        ljung_box = None

    return {
        "adf_pvalue": adf,
        "ljung_box_pvalue": ljung_box,
    }


@router.get("/statistics/residuals")
def dashboard_residuals(
    model: str = Query("sarima"),
    period: str = Query("today"),
    start: date | None = Query(None),
    end: date | None = Query(None),
):
    model, period, start, end, a, b = _dashboard_period(
        period, start, end, model
    )

    rows = _dashboard_rows(model, a, b)

    if not rows:
        return {
            "n": 0,
            "model_label": _DASHBOARD_MODELS[model][0],
            "tests": [],
            "histogram": [],
        }

    values = np.asarray([row[1:] for row in rows], dtype=float)
    y = values[:, 0]

    rte_errors = values[:, 1] - y
    model_errors = values[:, 4] - y

    # One common histogram scale for both series.
    combined = np.concatenate((rte_errors, model_errors))
    edges = np.histogram_bin_edges(combined, bins=28)

    rte_counts, _ = np.histogram(rte_errors, bins=edges)
    model_counts, _ = np.histogram(model_errors, bins=edges)

    histogram = [
        {
            "center": float((edges[i] + edges[i + 1]) / 2),
            "rte": int(rte_counts[i]),
            "model": int(model_counts[i]),
        }
        for i in range(len(edges) - 1)
    ]

    return {
        "n": len(rows),
        "model_label": _DASHBOARD_MODELS[model][0],
        "tests": [
            {"model": "RTE", **_dashboard_pvalues(rte_errors)},
            {
                "model": _DASHBOARD_MODELS[model][0],
                **_dashboard_pvalues(model_errors),
            },
        ],
        "histogram": histogram,
    }
