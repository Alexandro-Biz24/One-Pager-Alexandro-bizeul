"""RTE consumption and Météo-France temperature for one French hour range."""

from __future__ import annotations

import json
import os
import time
from base64 import b64encode
from datetime import datetime, timedelta, timezone
from io import StringIO
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

import pandas as pd

from timeseries.pipeline.env import load_env

TOKEN_URL = "https://digital.iservices.rte-france.com/token/oauth/"
RTE_ROOT = "https://digital.iservices.rte-france.com/open_api/consumption/v1"
MF_ROOT = "https://public-api.meteofrance.fr/public/DPClim/v1"

STATIONS = {
    "AGEN-LA GARENNE": "47091001",
    "BASTIA": "20148001",
    "BESANCON": "25056001",
    "BORDEAUX-MERIGNAC": "33281001",
    "BOURG ST MAURICE": "73054001",
    "BREST-GUIPAVAS": "29075001",
    "CAEN-CARPIQUET": "14137001",
    "CHATEAUROUX DEOLS": "36063001",
    "CLERMONT-FD": "63113001",
    "COGNAC": "16089001",
    "DIJON-LONGVIC": "21473001",
    "LE MANS": "72181001",
    "LILLE-LESQUIN": "59343001",
    "LYON-BRON": "69029001",
    "MARIGNANE": "13054001",
    "MONTELIMAR": "26198001",
    "NANCY-ESSEY": "54526001",
    "NANTES-BOUGUENAIS": "44020001",
    "NEVERS-MARZY": "58160001",
    "NICE": "06088001",
    "NIMES-COURBESSAC": "30189001",
    "ORLEANS": "45055001",
    "PARIS-MONTSOURIS": "75114001",
    "PAU-UZEIN": "64549001",
    "PERPIGNAN": "66136001",
    "POITIERS-BIARD": "86027001",
    "REIMS-PRUNAY": "51449002",
    "RENNES-ST JACQUES": "35281001",
    "STRASBOURG-ENTZHEIM": "67124001",
    "TOULOUSE-BLAGNAC": "31069001",
}


def _rte_token() -> str:
    load_env()
    client_id = os.environ.get("RTE_CLIENT_ID", "")
    client_secret = os.environ.get("RTE_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        raise RuntimeError("RTE_CLIENT_ID et RTE_CLIENT_SECRET manquent dans .env.")
    basic = b64encode(f"{client_id}:{client_secret}".encode()).decode()
    request = Request(
        TOKEN_URL,
        data=b"",
        method="POST",
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    with urlopen(request, timeout=30) as response:
        payload = json.load(response)
    return payload["access_token"]


def _rte_get(path: str, token: str, **query) -> tuple[int, dict]:
    parts = [f"{key}={value}" for key, value in query.items()]
    url = f"{RTE_ROOT}/{path}?{'&'.join(parts)}"
    request = Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urlopen(request, timeout=60) as response:
            return response.status, json.load(response)
    except HTTPError as exc:
        body = exc.read().decode()
        return exc.code, {"error": body[:300]}


def _stamp(moment: datetime) -> str:
    return quote(moment.isoformat(timespec="seconds"), safe=":-")


def fetch_consumption(start: datetime, end: datetime, kinds: str) -> pd.DataFrame:
    """Hourly load and D-1 forecast. Each hour keeps the quarter that opens it.

    `start` and `end` are Europe/Paris midnights. The returned index is UTC.
    """
    token = _rte_token()
    rows = []
    cursor = start
    while cursor < end:
        stop = min(cursor + timedelta(days=7), end)
        status, payload = _rte_get(
            "short_term",
            token,
            start_date=_stamp(cursor),
            end_date=_stamp(stop),
            type=kinds,
        )
        if status != 200:
            raise RuntimeError(cursor.isoformat(), status, payload)
        for block in payload.get("short_term", []):
            kind = block.get("type")
            if kind not in ("REALISED", "D-1"):
                continue
            for point in block.get("values") or []:
                rows.append((kind, point["start_date"], point["value"]))
        cursor = stop

    raw = pd.DataFrame(rows, columns=["kind", "start", "value"]).drop_duplicates(["kind", "start"])
    raw["utc"] = pd.to_datetime(raw["start"], utc=True)
    first = raw[raw["utc"].dt.minute.eq(0) & raw["utc"].dt.second.eq(0)]
    hourly = (
        first.pivot_table(index="utc", columns="kind", values="value", aggfunc="first")
        .rename(columns={"REALISED": "load", "D-1": "prediction_d1"})
    )
    for column in ("load", "prediction_d1"):
        if column not in hourly.columns:
            hourly[column] = pd.NA
    return hourly[["load", "prediction_d1"]].sort_index()


def _mf_get(path: str, api_key: str, **query) -> tuple[int, bytes]:
    url = f"{MF_ROOT}/{path}"
    if query:
        url += "?" + urlencode(query)
    request = Request(url, headers={"accept": "*/*", "apikey": api_key})
    for _ in range(8):
        try:
            with urlopen(request, timeout=120) as response:
                return response.status, response.read()
        except HTTPError as exc:
            body = exc.read()
            if exc.code in (429, 500, 503) or b"SUSPENDED" in body:
                print(f"Météo-France en pause ({exc.code}), nouvel essai dans 65 s", flush=True)
                time.sleep(65)
                continue
            return exc.code, body
    return exc.code, body


def _station_temperature(api_key: str, station_id: str, start: datetime, end: datetime) -> pd.Series:
    start_utc = start.astimezone(timezone.utc)
    end_utc = (end - timedelta(hours=1)).astimezone(timezone.utc)
    status, body = _mf_get(
        "commande-station/horaire",
        api_key,
        **{
            "id-station": station_id,
            "date-deb-periode": start_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "date-fin-periode": end_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
    )
    if status != 202:
        raise RuntimeError(station_id, status, body[:200])
    order = json.loads(body)["elaboreProduitAvecDemandeResponse"]["return"]
    for _ in range(20):
        status, body = _mf_get("commande/fichier", api_key, **{"id-cmde": order})
        if status == 201 and len(body) > 100:
            frame = pd.read_csv(
                StringIO(body.decode("utf-8")),
                sep=";",
                decimal=",",
                usecols=["DATE", "T"],
            )
            frame["utc"] = pd.to_datetime(frame["DATE"].astype(str), format="%Y%m%d%H", utc=True)
            return frame.set_index("utc")["T"].rename(station_id)
        time.sleep(3)
    raise RuntimeError(station_id, "fichier indisponible")


def fetch_temperature(start: datetime, end: datetime) -> pd.Series:
    """Mean hourly temperature of the 30 national-indicator stations. Index is UTC."""
    load_env()
    api_key = os.environ.get("METEOFRANCE_API_KEY", "")
    if not api_key:
        raise RuntimeError("METEOFRANCE_API_KEY manque dans .env.")
    series = []
    for name, station_id in STATIONS.items():
        series.append(_station_temperature(api_key, station_id, start, end))
        print(name, len(series[-1]), flush=True)
        time.sleep(3)
    return pd.concat(series, axis=1).mean(axis=1).rename("temperature")
