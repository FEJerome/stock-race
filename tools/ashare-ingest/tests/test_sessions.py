"""Session state-machine tests (plan section 5.2/5.3) using the mini fixture."""

from __future__ import annotations

from pathlib import Path

import pytest

from ashare_ingest.clean.calendar import trading_days
from ashare_ingest.clean.sessions import build_sessions, quantize_price
from ashare_ingest.raw.archive import read_csv

FIXTURE = Path(__file__).parent / "fixtures" / "mini-raw"
RANGE_START = "2024-03-04"
RANGE_END = "2024-03-08"


def _load():
    _header, cal_rows = read_csv(FIXTURE / "bs-trade-dates-2024-03-04_2024-03-08.csv")
    _header, bs_rows = read_csv(FIXTURE / "bs-600519-2024-03-04_2024-03-08-raw.csv")
    return [d for d in trading_days(cal_rows) if RANGE_START <= d <= RANGE_END], bs_rows


def _issues(result):
    return {issue.code: issue for issue in result.issues}


def test_state_machine_trading_suspended_missing():
    calendar, bs_rows = _load()
    result = build_sessions(calendar, bs_rows, ipo_date="2001-08-27", out_date="")

    assert [s.date for s in result.sessions] == [
        "2024-03-04", "2024-03-05", "2024-03-06", "2024-03-07", "2024-03-08",
    ]
    assert [s.status for s in result.sessions] == [
        "trading", "suspended", "trading", "trading", "missing",
    ]


def test_suspended_session_strips_pseudo_ohlc():
    calendar, bs_rows = _load()
    result = build_sessions(calendar, bs_rows, ipo_date="2001-08-27", out_date="")
    suspended = result.sessions[1]
    assert suspended.status == "suspended"
    assert suspended.bar is None  # pseudo OHLC (= previous close) must never enter a bar


def test_bar_quantization_and_zero_volume():
    calendar, bs_rows = _load()
    result = build_sessions(calendar, bs_rows, ipo_date="2001-08-27", out_date="")
    first = result.sessions[0].bar
    assert first.open == "10.000000"
    assert first.high == "10.500000"
    assert first.low == "9.800000"
    assert first.close == "10.200000"
    assert first.volume == "1000000.000000"

    zero_volume = result.sessions[2]
    assert zero_volume.status == "trading"  # tradestatus=1 wins over volume=0
    assert zero_volume.bar.volume == "0.000000"


def test_quality_issue_codes():
    calendar, bs_rows = _load()
    result = build_sessions(calendar, bs_rows, ipo_date="2001-08-27", out_date="")
    issues = _issues(result)

    assert issues["MISSING_SESSIONS"].blocking is True
    assert "2024-03-08" in issues["MISSING_SESSIONS"].message
    assert issues["ZERO_VOLUME_TRADING_DAY"].blocking is False
    assert issues["ST_SESSIONS_PRESENT"].blocking is False
    assert issues["SUSPENDED_SESSIONS_PRESENT"].blocking is False


def test_not_listed_at_start_blocks():
    # pre-IPO days carry no raw rows (mirrors real source behaviour)
    calendar = ["2024-03-04", "2024-03-05"]
    rows = [
        {"date": "2024-03-05", "tradestatus": "1", "open": "1", "high": "1", "low": "1",
         "close": "1", "volume": "100", "isST": "0"},
    ]
    result = build_sessions(calendar, rows, ipo_date="2024-03-05", out_date="")
    issues = _issues(result)
    assert issues["NOT_LISTED_AT_START"].blocking is True
    # pre-listing day is explained and must not be an unexplained gap
    assert result.not_listed_dates == ["2024-03-04"]
    assert result.unexplained_missing_dates == []
    assert result.sessions[0].status == "missing"


def test_delisted_in_range_blocks():
    # post-delisting days carry no raw rows (mirrors real source behaviour)
    calendar = ["2024-03-07", "2024-03-08"]
    rows = [
        {"date": "2024-03-07", "tradestatus": "1", "open": "1", "high": "1", "low": "1",
         "close": "1", "volume": "100", "isST": "0"},
    ]
    result = build_sessions(calendar, rows, ipo_date="2001-08-27", out_date="2024-03-07")
    issues = _issues(result)
    assert issues["DELISTED_IN_RANGE"].blocking is True
    assert result.delisted_dates == ["2024-03-08"]
    assert result.sessions[1].status == "missing"


def test_quantize_price_rejects_subscale_input():
    with pytest.raises(ValueError):
        quantize_price("1.23456789")  # rounding would be required -> forbidden
    assert quantize_price("10.2") == "10.200000"
