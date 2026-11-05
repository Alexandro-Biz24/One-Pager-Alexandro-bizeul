"""Fetch the RTE D-1 forecast for the next French civil day."""

from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from timeseries.pipeline.clock import (
    day_bounds,
    paris_hours,
)

from timeseries.pipeline.fetch import fetch_consumption


def fetch_future_rte(run_day: date) -> pd.Series:
    """
    Fetch RTE D-1 for the target day J+1.

    Allow missing forecasts only on the first repeated
    local 02:00 during autumn DST.

    Keep all 25 UTC timestamps on that day.
    """
    target = run_day + timedelta(days=1)

    start, end = day_bounds(target)

    expected = paris_hours(target)

    frame = fetch_consumption(
        start,
        end,
        "D-1",
    )

    values = pd.to_numeric(
        frame["prediction_d1"].reindex(expected),
        errors="coerce",
    )

    local = (
        expected
        .tz_convert("Europe/Paris")
        .tz_localize(None)
    )

    excluded = local.duplicated(keep="last")

    invalid = (
        values.isna().to_numpy()
        & ~excluded
    )

    if invalid.any():
        raise RuntimeError(
            f"Incomplete RTE D-1 for {target}: "
            f"{list(expected[invalid])}"
        )

    values.name = "prediction_d1"

    return values