"""Central hourly raw+features table. No model prediction code here."""
from __future__ import annotations
from datetime import datetime
from contextlib import contextmanager
import math
import pandas as pd
import psycopg
from psycopg.rows import dict_row
from timeseries.connections.neon import database_url
from timeseries.pipeline.env import load_env

RAW = ("load","temperature","prediction_d1")
FEATURES = ("load_lag_48h","load_lag_168h","temperature_lag_48h", "hdd_48h", "cdd_48h", "rte_error_lag_48h", "target_hour", "target_day_of_week", "target_month", "season", "month", "day", "hour", "calendar_amplify", "calendar_amplify_ewa")
ALL_COLUMNS = RAW + FEATURES

@contextmanager
def connect():
    load_env()
    with psycopg.connect(database_url(), connect_timeout=15) as db:
        yield db

def init_tables():
    # Existing tables from the template are *not* modified.
    ddl = """
    CREATE TABLE IF NOT EXISTS hourly_data (
      utc TIMESTAMPTZ PRIMARY KEY,
      tz_fr TIMESTAMPTZ NOT NULL,
      load DOUBLE PRECISION,
      temperature DOUBLE PRECISION,
      prediction_d1 DOUBLE PRECISION,
      rte_frozen_at TIMESTAMPTZ,
      load_lag_48h DOUBLE PRECISION,
      load_lag_168h DOUBLE PRECISION,
      temperature_lag_48h DOUBLE PRECISION,
      hdd_48h DOUBLE PRECISION,
      cdd_48h DOUBLE PRECISION,
      rte_error_lag_48h DOUBLE PRECISION,
      target_hour INTEGER,
      target_day_of_week INTEGER,
      target_month INTEGER,
      season INTEGER,
      month INTEGER,
      day INTEGER,
      hour INTEGER,
      calendar_amplify DOUBLE PRECISION,
      calendar_amplify_ewa DOUBLE PRECISION,
      features_frozen_at TIMESTAMPTZ,
      CHECK (features_frozen_at IS NULL OR rte_frozen_at IS NOT NULL)
    );
    """
    with connect() as db:
        db.execute(ddl)

def _py(value):
    if value is None or pd.isna(value): return None
    if isinstance(value,pd.Timestamp): return value.to_pydatetime()
    if hasattr(value,'item'): return value.item()
    return value

def write_observed(db, df: pd.DataFrame):
    """
    Insert historical observations.

    Existing non-NULL load and temperature values
    are never overwritten.
    """
    if df.empty:
        return

    sql = """
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
    """

    args = [
        (
            _py(t),
            _py(t.tz_convert("Europe/Paris")),
            _py(row["load"]),
            _py(row["temperature"]),
        )
        for t, row in df.iterrows()
    ]

    with db.cursor() as cur:
        cur.executemany(sql, args)

def write_rte_once(db, fc: pd.Series, origin: pd.Timestamp):
    """Insert RTE forecasts once and complete missing archive metadata."""

    sql = """
        INSERT INTO hourly_data (
            utc, tz_fr, prediction_d1, rte_frozen_at
        )
        VALUES (%s, %s, %s, %s)

        ON CONFLICT (utc) DO UPDATE SET
            prediction_d1 = COALESCE(
                hourly_data.prediction_d1,
                EXCLUDED.prediction_d1
            ),
            rte_frozen_at = COALESCE(
                hourly_data.rte_frozen_at,
                EXCLUDED.rte_frozen_at
            )
    """

    args = [
        (
            _py(t),
            _py(t.tz_convert("Europe/Paris")),
            _py(v),
            _py(origin),
        )
        for t, v in fc.items()
    ]

    with db.cursor() as cur:
        cur.executemany(sql, args)

def read_window(db,start:pd.Timestamp,end:pd.Timestamp)->pd.DataFrame:
    """UTC inclusive start, exclusive end; no selection on local time."""
    rows=db.execute('SELECT utc,load,temperature,prediction_d1 FROM hourly_data WHERE utc >= %s AND utc < %s ORDER BY utc',(_py(start),_py(end))).fetchall()
    if not rows:return pd.DataFrame(columns=list(RAW),index=pd.DatetimeIndex([],tz='UTC',name='utc'))
    df=pd.DataFrame(rows,columns=['utc',*RAW]); df['utc']=pd.to_datetime(df['utc'],utc=True)
    return df.set_index('utc').sort_index()

def write_features_once(db, frame: pd.DataFrame, origin: pd.Timestamp):
    """Freeze features on existing RTE target rows, without overwriting."""

    cols = list(FEATURES)

    assignments = ", ".join(f"{col} = %s" for col in cols)

    sql = f"""
        UPDATE hourly_data
        SET {assignments},
            features_frozen_at = %s
        WHERE utc = %s
          AND prediction_d1 IS NOT NULL
          AND rte_frozen_at IS NOT NULL
          AND features_frozen_at IS NULL
    """

    with db.cursor() as cur:
        for utc, row in frame.iterrows():

            values = [
                *(_py(row[col]) for col in cols),
                _py(origin),
                _py(utc),
            ]

            cur.execute(sql, values)

            if cur.rowcount != 1:
                raise RuntimeError(
                    f"Features could not be frozen at {utc}. "
                    "Missing RTE row, missing archive timestamp, "
                    "or features already frozen."
                )

def read_target(db, start, end):
    cols=['utc','tz_fr',*ALL_COLUMNS,'rte_frozen_at','features_frozen_at']
    columns = ", ".join(cols)

    rows = db.execute(
        f"SELECT {columns} FROM hourly_data WHERE utc >= %s AND utc < %s ORDER BY utc",
        (_py(start), _py(end))
    ).fetchall()
    df=pd.DataFrame(rows,columns=cols)
    df['utc']=pd.to_datetime(df['utc'],utc=True)
    return df.set_index('utc')
