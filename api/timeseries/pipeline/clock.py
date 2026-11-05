"""French clock hours used by the daily feed."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

PARIS = ZoneInfo("Europe/Paris")


def as_of_paris(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        return moment.replace(tzinfo=PARIS)
    return moment.astimezone(PARIS)


def _midnight(day: date) -> pd.Timestamp:
    """Local midnight. The clock change is at 02:00, so midnight itself is unambiguous."""
    return pd.Timestamp(year=day.year, month=day.month, day=day.day, tz=PARIS)


def paris_hours(day: date) -> pd.DatetimeIndex:
    """UTC timestamps of one French civil day.

    A normal day has 24 hours. The spring change has 23, the autumn change 25.
    """
    start = _midnight(day)
    end = _midnight(day + timedelta(days=1))
    hours = pd.date_range(start, end, freq="h", inclusive="left").tz_convert("UTC")
    hours.name = "utc"
    return hours


def day_bounds(day: date) -> tuple[datetime, datetime]:
    start = _midnight(day).to_pydatetime()
    end = _midnight(day + timedelta(days=1)).to_pydatetime()
    return start, end
