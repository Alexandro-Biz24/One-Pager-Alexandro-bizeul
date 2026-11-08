
from __future__ import annotations

import argparse
import json
from datetime import date, timedelta
from pathlib import Path
from timeseries.pipeline.store import connect


ARTIFACT_PATH = (
    Path(__file__).resolve().parent
    / "artifacts"
    / "rte_conformal_95.json"
)


def load_rte_quantile() -> float:
    if not ARTIFACT_PATH.exists():
        raise FileNotFoundError(
            f"RTE conformal artifact not found: {ARTIFACT_PATH}"
        )

    with open(ARTIFACT_PATH, "r", encoding="utf-8") as f:
        artifact = json.load(f)

    if artifact.get("coverage_target") != 0.95:
        raise ValueError("Unexpected RTE coverage target")

    q95 = float(artifact["q95_mw"])

    if not 0 <= q95 < float("inf"):
        raise ValueError("Invalid conformal quantile")

    return q95


def fill_rte_intervals(
    start: date | None = None,
    end: date | None = None,
    write: bool = True,
) -> int:
    """
    Fill missing RTE prediction intervals.

    start/end are inclusive Europe/Paris civil dates.
    None means no bound.

    Existing intervals are never overwritten.
    """
    if start is not None and end is not None and start > end:
        raise ValueError("start must be <= end")

    q95 = load_rte_quantile()

    conditions = [
        "prediction_d1 IS NOT NULL",
        "(rte_lower_95 IS NULL OR rte_upper_95 IS NULL)",
    ]

    parameters = []

    if start is not None:
        conditions.append(
            "utc >= (%s::date::timestamp AT TIME ZONE 'Europe/Paris')"
        )
        parameters.append(start)

    if end is not None:
        conditions.append(
            "utc < (%s::date::timestamp AT TIME ZONE 'Europe/Paris')"
        )
        parameters.append(end + timedelta(days=1))

    where_clause = " AND ".join(conditions)

    if write:
        query = f"""
            UPDATE hourly_data
            SET
                rte_lower_95 = COALESCE(
                    rte_lower_95,
                    prediction_d1 - %s
                ),
                rte_upper_95 = COALESCE(
                    rte_upper_95,
                    prediction_d1 + %s
                )
            WHERE {where_clause}
        """

        values = [q95, q95, *parameters]

    else:
        query = f"""
            SELECT COUNT(*)
            FROM hourly_data
            WHERE {where_clause}
        """
        values = parameters

    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(query, values)

            if write:
                count = cur.rowcount
            else:
                count = cur.fetchone()[0]

        if write:
            conn.commit()

    print(
        f"[RTE INTERVALS] write={write} "
        f"q95={q95:.2f} MW rows={count}"
    )

    return count


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument("--start", type=date.fromisoformat)
    parser.add_argument("--end", type=date.fromisoformat)
    parser.add_argument("--write", action="store_true")

    args = parser.parse_args()

    fill_rte_intervals(
        start=args.start,
        end=args.end,
        write=args.write,
    )


if __name__ == "__main__":
    main()
