"""Historical REALISED load and observed station-average temperature."""
from datetime import date, timedelta
import pandas as pd
from timeseries.pipeline.clock import day_bounds, paris_hours
from timeseries.pipeline.fetch import fetch_consumption, fetch_temperature


def fetch_historical_day(day: date) -> pd.DataFrame:
    """Fetch historical data, allowing only the excluded autumn DST slot."""

    start, end = day_bounds(day)
    expected = paris_hours(day)

    load = pd.to_numeric(
        fetch_consumption(start, end, "REALISED")["load"].reindex(expected),
        errors="coerce",
    )

    temperature = pd.to_numeric(
        fetch_temperature(start, end).reindex(expected),
        errors="coerce",
    )

    df = pd.DataFrame(
        {"load": load, "temperature": temperature},
        index=expected,
    )

    # Exclude the first repeated 02:00 during autumn DST.
    local = expected.tz_convert("Europe/Paris").tz_localize(None)
    excluded = pd.Series(
        local.duplicated(keep="last"),
        index=expected,
    )

    # Missing values are only allowed on this excluded slot.
    invalid = df[["load", "temperature"]].isna()
    invalid.loc[excluded] = False

    if invalid.any().any():
        raise RuntimeError(
            f"Incomplete historical data for {day}: "
            f"{invalid.sum().to_dict()}"
        )

    return df
