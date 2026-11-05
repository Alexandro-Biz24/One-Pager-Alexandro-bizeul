"""Neon Postgres.

The connection string comes from the NEON_DATABASE_URL environment variable.
"""

from __future__ import annotations

import os


def database_url() -> str:
    url = os.environ.get("NEON_DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("NEON_DATABASE_URL is not set. The Neon project is not created yet.")
    return url
