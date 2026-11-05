from datetime import date
import numpy as np
import pandas as pd
from timeseries.pipeline.clock import paris_hours
from timeseries.pipeline.features import engineer


def test_dst_day_lengths():
    assert len(paris_hours(date(2026,3,29)))==23
    assert len(paris_hours(date(2026,10,25)))==25
    assert len(paris_hours(date(2026,10,27)))==24


def test_lags_never_use_future():
    idx=pd.date_range('2026-10-01',periods=500,freq='h',tz='UTC')
    frame=pd.DataFrame({'load':np.arange(500.)+1000,'prediction_d1':np.arange(500.)+995,'temperature':np.full(500,10.)},index=idx)
    result=engineer(frame)
    assert result['load_lag_48h'].iloc[300]==frame['load'].iloc[252]
    assert result['load_lag_168h'].iloc[300]==frame['load'].iloc[132]
    assert result['rte_error_lag_48h'].iloc[300]==5
    assert result['hdd_48h'].iloc[300]==5
    assert result['calendar_amplify_ewa'].notna().all()
