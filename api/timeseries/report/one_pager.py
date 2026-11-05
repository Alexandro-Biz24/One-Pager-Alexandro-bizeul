"""One-pager recommendation PDF built from a forecast.

The pages and the figures are not specified yet.
"""

from __future__ import annotations

from pathlib import Path


def build(forecast: dict, destination: Path) -> Path:
    del forecast, destination
    raise NotImplementedError("The one-pager content is not specified yet.")
