"""Reconciliation tests: tolerance tiers, mismatch blocking, compare-only (plan section 8)."""

from __future__ import annotations

from pathlib import Path

from ashare_ingest.clean.adjust import compute_daily_factors
from ashare_ingest.clean.calendar import trading_days
from ashare_ingest.clean.corporate_actions import map_corporate_actions
from ashare_ingest.clean.reconcile import (
    blocking_issues_from_report,
    reconcile_all,
)
from ashare_ingest.clean.sessions import build_sessions
from ashare_ingest.raw.archive import read_csv

FIXTURE = Path(__file__).parent / "fixtures" / "mini-pass"
RANGE_START = "2024-03-04"
RANGE_END = "2024-03-08"


def _load():
    _h, cal_rows = read_csv(FIXTURE / "bs-trade-dates-2024-03-04_2024-03-08.csv")
    calendar = [d for d in trading_days(cal_rows) if RANGE_START <= d <= RANGE_END]
    _h, bs_rows = read_csv(FIXTURE / "bs-600519-2024-03-04_2024-03-08-raw.csv")
    _h, qfq_rows = read_csv(FIXTURE / "bs-600519-2024-03-04_2024-03-08-qfq.csv")
    _h, ak_rows = read_csv(FIXTURE / "ak-em-600519-2024-03-04_2024-03-08-raw.csv")
    _h, ak_div_rows = read_csv(FIXTURE / "ak-600519-dividend-detail.csv")
    _h, div_rows = read_csv(FIXTURE / "bs-600519-dividend-2024-operate.csv")

    sessions_result = build_sessions(calendar, bs_rows, ipo_date="2001-08-27", out_date="")
    actions, _issues = map_corporate_actions(
        div_rows, range_start=RANGE_START, range_end=RANGE_END, session_dates=set(calendar),
    )
    factors, _fissues = compute_daily_factors(actions, sessions_result.sessions, range_end=RANGE_END)
    return bs_rows, qfq_rows, ak_rows, ak_div_rows, actions, sessions_result.sessions, factors


def _reconcile(ak_rows=None, ak_div_rows=None, bs_rows=None):
    loaded = _load()
    bs_rows = bs_rows if bs_rows is not None else loaded[0]
    return reconcile_all(
        asset_id="stock:cn-a.sh.600519",
        bs_rows=bs_rows,
        qfq_rows=loaded[1],
        ak_rows=ak_rows if ak_rows is not None else loaded[2],
        ak_dividend_rows=ak_div_rows if ak_div_rows is not None else loaded[3],
        actions=loaded[4],
        sessions=loaded[5],
        factors=loaded[6],
        range_start=RANGE_START,
        range_end=RANGE_END,
    )


def test_fixture_reconciles_pass():
    report = _reconcile()
    assert report.passed, [check.detail for check in report.checks if not check.passed]


def test_volume_breach_blocks():
    ak_rows = read_csv(FIXTURE / "ak-em-600519-2024-03-04_2024-03-08-raw.csv")[1]
    ak_rows[0] = dict(ak_rows[0], 成交量="20000")  # 10000 lots off -> 1,000,000 shares
    report = _reconcile(ak_rows=ak_rows)
    volume_check = next(c for c in report.checks if c.name.startswith("volume"))
    assert not volume_check.passed
    assert not report.passed
    issues = blocking_issues_from_report(report)
    assert issues[0].code == "RECONCILE_MISMATCH"
    assert issues[0].blocking is True


def test_volume_tail_within_tolerance_passes():
    ak_rows = read_csv(FIXTURE / "ak-em-600519-2024-03-04_2024-03-08-raw.csv")[1]
    # +1 lot rounding tail stays within the 100-share tolerance
    ak_rows[0] = dict(ak_rows[0], 成交量="10001")
    report = _reconcile(ak_rows=ak_rows)
    assert report.passed, [c.detail for c in report.checks if not c.passed]


def test_ohlc_mismatch_blocks_and_lists_days():
    ak_rows = read_csv(FIXTURE / "ak-em-600519-2024-03-04_2024-03-08-raw.csv")[1]
    ak_rows[1] = dict(ak_rows[1], 收盘="10.31")
    report = _reconcile(ak_rows=ak_rows)
    ohlc = next(c for c in report.checks if c.name.startswith("OHLC"))
    assert not ohlc.passed
    assert "2024-03-06.close" in ohlc.detail


def test_coverage_mismatch_blocks():
    ak_rows = read_csv(FIXTURE / "ak-em-600519-2024-03-04_2024-03-08-raw.csv")[1]
    ak_rows = ak_rows[1:]  # drop 2024-03-04
    report = _reconcile(ak_rows=ak_rows)
    coverage = next(c for c in report.checks if c.name.startswith("trading-day"))
    assert not coverage.passed
    assert not report.passed


def test_amount_within_tolerance_not_averaged():
    ak_rows = read_csv(FIXTURE / "ak-em-600519-2024-03-04_2024-03-08-raw.csv")[1]
    # 0.4 yuan difference is accepted but reported verbatim (no averaging/merging)
    ak_rows[0] = dict(ak_rows[0], 成交额="10200000.40")
    report = _reconcile(ak_rows=ak_rows)
    assert report.passed
    amount = next(c for c in report.checks if c.name.startswith("amount"))
    assert "max|diff|=0.4000" in amount.detail


def test_dividend_mismatch_blocks():
    ak_div_rows = read_csv(FIXTURE / "ak-600519-dividend-detail.csv")[1]
    ak_div_rows[0] = dict(ak_div_rows[0], 派息="6")
    report = _reconcile(ak_div_rows=ak_div_rows)
    dividends = next(c for c in report.checks if c.name.startswith("cash dividend"))
    assert not dividends.passed


def test_preclose_arithmetic_check():
    # corrupt the bs preclose on the ex-date beyond the 0.005 tolerance
    bs_rows = read_csv(FIXTURE / "bs-600519-2024-03-04_2024-03-08-raw.csv")[1]
    for row in bs_rows:
        if row["date"] == "2024-03-07":
            row["preclose"] = "7.7000"  # theoretical is 7.6000
    report = _reconcile(bs_rows=bs_rows)
    preclose = next(c for c in report.checks if c.name.startswith("preclose"))
    assert not preclose.passed
    assert not report.passed
