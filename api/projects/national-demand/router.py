"""Day slice from the stored hourly file. No training."""

from __future__ import annotations

import csv
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

PARIS = ZoneInfo("Europe/Paris")
ROOT = Path(__file__).resolve().parents[4]
CSV_PATH = ROOT / "france_electricity_hourly.csv"
HISTORY_PATH = Path(__file__).with_name("history.json")

_ROWS: list[tuple[datetime, float, float]] | None = None


def load_rows() -> list[tuple[datetime, float, float]]:
    global _ROWS
    if _ROWS is not None:
        return _ROWS
    rows: list[tuple[datetime, float, float]] = []
    with CSV_PATH.open(newline="") as handle:
        for record in csv.DictReader(handle):
            stamp = datetime.strptime(record["datetime_utc"], "%Y-%m-%d %H:%M:%S%z")
            load = record["load_mw"].strip()
            rte = record["rte_forecast_d1_mw"].strip()
            if not load or not rte:
                continue
            rows.append((stamp, float(load), float(rte)))
    _ROWS = rows
    return rows


def day_points(date_str: str) -> list[dict]:
    try:
        start = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=PARIS)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Use YYYY-MM-DD") from exc
    end = start + timedelta(days=1)
    points = []
    for stamp, load, rte in load_rows():
        local = stamp.astimezone(PARIS)
        if start <= local < end:
            points.append(
                {
                    "hour": local.strftime("%H:%M"),
                    "actual": round(load, 1),
                    "rte": round(rte, 1),
                }
            )
    if not points:
        raise HTTPException(status_code=404, detail="No hours for this date")
    return points


def rte_stats(points: list[dict]) -> dict:
    abs_pct = [
        100 * abs(point["actual"] - point["rte"]) / point["actual"]
        for point in points
        if point["actual"]
    ]
    fails = sum(value > 5 for value in abs_pct)
    return {
        "mape": round(sum(abs_pct) / len(abs_pct), 2),
        "ape_above_5": fails,
        "hours": len(points),
    }


class AnalysisRequest(BaseModel):
    date: str
    model: str = Field(pattern="^(sarima|lightgbm|mtst)$")


@router.get("/day")
def day(date: str, model: str = "lightgbm"):
    if model not in {"sarima", "lightgbm", "mtst"}:
        raise HTTPException(status_code=400, detail="Unknown model")
    points = day_points(date)
    return {
        "date": date,
        "model": model,
        "points": points,
        "rte": rte_stats(points),
        "model_forecast": None,
    }


@router.get("/history")
def history():
    if not HISTORY_PATH.exists():
        return []
    return json.loads(HISTORY_PATH.read_text())


@router.post("/analysis")
def analysis(body: AnalysisRequest):
    points = day_points(body.date)
    stats = rte_stats(points)
    record = {
        "date": body.date,
        "model": body.model,
        "rte_mape": stats["mape"],
        "ape_above_5": stats["ape_above_5"],
        "hours": stats["hours"],
        "recorded_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    saved = []
    if HISTORY_PATH.exists():
        saved = json.loads(HISTORY_PATH.read_text())
    saved = [item for item in saved if not (item["date"] == body.date and item["model"] == body.model)]
    saved.append(record)
    saved.sort(key=lambda item: (item["date"], item["model"]))
    HISTORY_PATH.write_text(json.dumps(saved, indent=2))
    return {"record": record, "points": points, "rte": stats}
