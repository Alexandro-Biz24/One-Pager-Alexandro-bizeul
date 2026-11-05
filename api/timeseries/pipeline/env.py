"""Load site/api/.env without printing secrets."""

from __future__ import annotations

import os
from pathlib import Path


def load_env() -> None:
    here = Path.cwd()
    candidates = [here / ".env", here / "site" / "api" / ".env"]
    candidates += [parent / "site" / "api" / ".env" for parent in here.parents]
    candidates += [parent / ".env" for parent in here.parents if parent.name == "api"]
    for path in candidates:
        if not path.is_file():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ[key.strip()] = value.strip().strip('"').strip("'")
        return
