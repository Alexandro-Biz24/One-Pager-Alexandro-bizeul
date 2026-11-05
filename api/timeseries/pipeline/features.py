"""Feature columns shared by the three Neon tables.

Same scores as the project notebook. The index stays in UTC.
HDD and CDD use the temperature observed 48 hours earlier.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from timeseries.pipeline.clock import PARIS

CALENDAR_CONFIG = {
    "season": {
        "winter": {"periods": [("12-01", "02-28")], "score": 2},
        "summer": {"periods": [("06-01", "08-31")], "score": -2},
        "marginal_summer": {
            "periods": [("05-15", "05-31"), ("09-01", "10-15")],
            "score": -1,
        },
        "other": {"score": 0},
    },
    "month": {
        "business_holiday": {
            "periods": [("12-15", "01-05"), ("07-15", "08-31")],
            "score": -2,
        },
        "school_holiday": {
            "periods": [
                ("12-21", "01-04"),
                ("02-15", "03-01"),
                ("04-12", "04-25"),
                ("07-06", "08-31"),
                ("10-20", "11-02"),
            ],
            "score": -1,
        },
        "normal_score": 2,
        "both_score": -3,
    },
    "day": {
        "business_days": [0, 1, 2, 3, 4],
        "business_score": 1,
        "weekend_score": -1,
        "business_holiday_bonus": -1,
    },
    "hour": {
        "activity_hours": [(5, 9), (17, 20)],
        "activity_score": 1,
        "inactivity_score": -1,
    },
}


def _in_periods(month_day: pd.Series, periods) -> pd.Series:
    mask = pd.Series(False, index=month_day.index)
    for start, end in periods:
        if start <= end:
            mask |= month_day.between(start, end)
        else:
            mask |= (month_day >= start) | (month_day <= end)
    return mask


def engineer(frame: pd.DataFrame) -> pd.DataFrame:
    """Add every column the three tables need.

    `frame` is indexed by UTC and contains `load`, `prediction_d1`, `temperature`.
    Hours without an observation stay empty. Nothing is interpolated across them,
    so a future hour does not receive a made-up load.
    """
    data = frame.copy().sort_index()
    if data.index.tz is None:
        data.index = data.index.tz_localize("UTC")
    else:
        data.index = data.index.tz_convert("UTC")
    full = pd.date_range(data.index.min(), data.index.max(), freq="h", tz="UTC")
    data = data.reindex(full)
    data.index.name = "utc"

    local = data.index.tz_convert(PARIS)
    data["tz_fr"] = local
    lag = data["temperature"].shift(48)
    data["hdd"] = (15 - lag).clip(lower=0)
    data["cdd"] = (lag - 22).clip(lower=0)

    data["target_hour"] = local.hour
    data["target_day_of_week"] = local.dayofweek
    data["target_month"] = local.month
    month_day = pd.Series(local.strftime("%m-%d"), index=data.index)

    season_cfg = CALENDAR_CONFIG["season"]
    winter = _in_periods(month_day, season_cfg["winter"]["periods"]) | month_day.eq("02-29")
    summer = _in_periods(month_day, season_cfg["summer"]["periods"])
    marginal = _in_periods(month_day, season_cfg["marginal_summer"]["periods"])
    data["season"] = np.select(
        [winter, summer, marginal],
        [
            season_cfg["winter"]["score"],
            season_cfg["summer"]["score"],
            season_cfg["marginal_summer"]["score"],
        ],
        default=season_cfg["other"]["score"],
    )

    month_cfg = CALENDAR_CONFIG["month"]
    business_holiday = _in_periods(month_day, month_cfg["business_holiday"]["periods"])
    school_holiday = _in_periods(month_day, month_cfg["school_holiday"]["periods"])
    data["month"] = np.select(
        [business_holiday & school_holiday, business_holiday, school_holiday],
        [
            month_cfg["both_score"],
            month_cfg["business_holiday"]["score"],
            month_cfg["school_holiday"]["score"],
        ],
        default=month_cfg["normal_score"],
    )

    day_cfg = CALENDAR_CONFIG["day"]
    business_day = data["target_day_of_week"].isin(day_cfg["business_days"])
    data["day"] = np.where(business_day, day_cfg["business_score"], day_cfg["weekend_score"])
    data["day"] = data["day"] + business_holiday.astype(int) * day_cfg["business_holiday_bonus"]

    hour_cfg = CALENDAR_CONFIG["hour"]
    activity = pd.Series(False, index=data.index)
    for start, end in hour_cfg["activity_hours"]:
        activity |= data["target_hour"].between(start, end - 1)
    data["hour"] = np.where(activity, hour_cfg["activity_score"], hour_cfg["inactivity_score"])

    data["load_lag_48h"] = data["load"].shift(48)
    data["load_lag_168h"] = data["load"].shift(168)
    data["temperature_lag_48h"] = lag
    data["calendar_amplify"] = data[["season", "month", "day", "hour"]].sum(axis=1)
    data["calendar_amplify_ewa"] = (8 * data["hour"] + 4 * data["season"] + 2 * data["day"] + data["month"]) / 15
    data["rte_forecast_d1_mw_disp"] = data["prediction_d1"]
    data["rte_error_lag_48h"] = (data["load"] - data["prediction_d1"]).shift(48)
    data["hdd_48h"] = data["hdd"]
    data["cdd_48h"] = data["cdd"]
    data["load_mw"] = data["load"]
    data["residual_target"] = data["load_mw"] - data["rte_forecast_d1_mw_disp"]
    return data


MODEL_FEATURES = [
    "target_hour",
    "target_day_of_week",
    "target_month",
    "rte_forecast_d1_mw_disp",
    "rte_error_lag_48h",
    "hdd_48h",
    "cdd_48h",
    "season",
    "month",
    "day",
    "hour",
]
