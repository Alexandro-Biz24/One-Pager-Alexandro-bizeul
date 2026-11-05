"""Seed historical observations and historical RTE D-1 for lag features.

    WARNING: historical D-1 from today's API is a retrospective data view,
    not proof of what was available at J 13:00. Never label a backfill as live.
"""
from datetime import date,timedelta
import pandas as pd
from timeseries.pipeline.clock import day_bounds,paris_hours
from timeseries.pipeline.fetch import fetch_consumption
from timeseries.pipeline.fetch_history import fetch_historical_day
from timeseries.pipeline.store import init_tables,connect,write_observed,write_rte_once


def bootstrap_day(day:date, *, write:bool=False):
    obs=fetch_historical_day(day)
    start,end=day_bounds(day)
    raw=fetch_consumption(start,end,'D-1')
    fc=pd.to_numeric(raw['prediction_d1'].reindex(paris_hours(day)),errors='coerce')
    # First repeated 02:00 is excluded during autumn DST.
    hours = paris_hours(day)
    local = hours.tz_convert("Europe/Paris").tz_localize(None)
    excluded = local.duplicated(keep="last")

    # Missing RTE forecasts are tolerated only on the excluded DST hour.
    invalid = fc.isna().to_numpy() & ~excluded

    if invalid.any():
        missing_hours = fc.index[invalid]
        raise RuntimeError(
            f"Historical D-1 incomplete {day}: {list(missing_hours)}"
        )
    if not write:return {'day':str(day),'hours':len(fc),'write':False}
    init_tables()
    with connect() as db:
        write_observed(db,obs)
        # Historical data tagged with actual ingestion time, not fabricated J-1 13:00.
        write_rte_once(db,fc,pd.Timestamp.now(tz='UTC'))
    return {'day':str(day),'hours':len(fc),'write':True}


def bootstrap_range(first:date,last:date,*,write:bool=False):
    if last<first:raise ValueError('last < first')
    out=[];day=first
    while day<=last:
        out.append(bootstrap_day(day,write=write))
        day+=timedelta(days=1)
    return out
