"""adjustment-formula@1 factor-chain tests with hand-computed goldens (plan section 7)."""

from __future__ import annotations

from decimal import Decimal

from ashare_ingest.clean.adjust import (
    adjustment_factor_for,
    apply_signal_prices,
    compute_daily_factors,
)
from ashare_ingest.clean.corporate_actions import BonusIssueAction, CashDividendAction
from ashare_ingest.clean.sessions import Session, Bar


def _session(date: str, close: str, status: str = "trading") -> Session:
    if status != "trading":
        return Session(date=date, status=status)
    return Session(date=date, status="trading", bar=Bar(
        date=date,
        open=close, high=close, low=close, close=close,
        volume="1000.000000",
    ))


def test_moutai_2024_factor_and_preclose_crosscheck():
    """Section 7.2 worked example: 600519 ex-date 2024-06-19."""
    c_prev = Decimal("1521.50")
    cash = Decimal("30.876")
    factor = (c_prev - cash) / c_prev  # no bonus -> ratio 0
    # (1521.50 - 30.876) = 1490.624
    assert c_prev - cash == Decimal("1490.624")
    # cross-check against the frozen Baostock preclose 1490.62 within 0.005
    assert abs((c_prev - cash) - Decimal("1490.62")) <= Decimal("0.005")
    # factor sanity: raw x factor must land back on the adjusted close scale
    assert abs(Decimal("1521.50") * factor - Decimal("1490.624")) < Decimal("0.0000001")


def test_anchor_and_chain_semantics():
    actions = [
        CashDividendAction("cashDividend", "2024-06-18", "2024-06-19", "2024-06-19", "1.000000"),
        CashDividendAction("cashDividend", "2024-12-19", "2024-12-20", "2024-12-20", "1.000000"),
    ]
    sessions = [
        _session("2024-06-17", "100.000000"),
        _session("2024-06-18", "101.000000"),
        _session("2024-06-19", "99.000000"),
        _session("2024-12-19", "98.000000"),
        _session("2024-12-20", "97.000000"),
        _session("2024-12-31", "96.000000"),
    ]
    factors, issues = compute_daily_factors(actions, sessions, range_end="2024-12-31")
    assert issues == []
    assert set(factors) == {"2024-06-19", "2024-12-20"}

    # d before both ex-dates -> product of both factors
    before = adjustment_factor_for("2024-06-17", factors, range_end="2024-12-31")
    assert before == factors["2024-06-19"] * factors["2024-12-20"]
    # d between the ex-dates -> only the later one
    middle = adjustment_factor_for("2024-06-19", factors, range_end="2024-12-31")
    assert middle == factors["2024-12-20"]
    # d at/after the last ex-date -> 1 (snapshot end anchors to raw)
    assert adjustment_factor_for("2024-12-20", factors, range_end="2024-12-31") == Decimal(1)
    assert adjustment_factor_for("2024-12-31", factors, range_end="2024-12-31") == Decimal(1)


def test_c_prev_skips_suspended_sessions():
    actions = [
        CashDividendAction("cashDividend", "2024-03-06", "2024-03-07", "2024-03-07", "0.500000"),
    ]
    sessions = [
        _session("2024-03-05", "50.000000"),
        _session("2024-03-06", "99.000000", status="suspended"),
        _session("2024-03-07", "40.000000"),
    ]
    factors, issues = compute_daily_factors(actions, sessions, range_end="2024-03-07")
    assert issues == []
    # C_prev must be the 2024-03-05 trading close (50), not the suspended pseudo-OHLC
    assert factors["2024-03-07"] == (Decimal("50") - Decimal("0.5")) / Decimal("50")


def test_signal_prices_half_up_and_explicit_raw_segments():
    actions = [
        CashDividendAction("cashDividend", "2024-03-06", "2024-03-07", "2024-03-07", "0.500000"),
        BonusIssueAction("bonusIssue", "2024-03-06", "2024-03-07", "2024-03-12", 1, 4),
    ]
    sessions = [
        Session("2024-03-04", "trading", Bar("2024-03-04", "10.000000", "10.500000", "9.800000", "10.200000", "1000000.000000")),
        Session("2024-03-05", "suspended"),
        Session("2024-03-06", "trading", Bar("2024-03-06", "10.200000", "10.400000", "10.100000", "10.000000", "0.000000")),
        Session("2024-03-07", "trading", Bar("2024-03-07", "7.700000", "7.800000", "7.500000", "7.600000", "1500000.000000")),
    ]
    factors, issues = compute_daily_factors(actions, sessions, range_end="2024-03-08")
    assert issues == []
    # f = (10 - 0.5)/10/1.25 = 0.76 exactly
    assert factors["2024-03-07"] == Decimal("0.76")

    apply_signal_prices(sessions, factors, range_end="2024-03-08")

    day1 = sessions[0].bar
    assert day1.signal_open == "7.600000"    # 10.00 x 0.76
    assert day1.signal_high == "7.980000"    # 10.50 x 0.76
    assert day1.signal_low == "7.448000"     # 9.80 x 0.76
    assert day1.signal_close == "7.752000"   # 10.20 x 0.76

    day3 = sessions[2].bar
    assert day3.signal_close == "7.600000"   # 10.00 x 0.76, exact

    ex_day = sessions[3].bar
    # on/after the ex-date the anchor factor is 1: signal equals raw, still explicit
    assert ex_day.signal_close == ex_day.close == "7.600000"
    assert ex_day.signal_open == "7.700000"

    # suspended sessions carry no bar and no signal fields
    assert sessions[1].bar is None


def test_signal_half_up_boundary_rounds_up():
    sessions = [
        Session("2024-03-04", "trading", Bar("2024-03-04", "0.100000", "0.100000", "0.100000", "0.100000", "1.000000")),
    ]
    # 0.1 x 1.2345675 = 0.12345675 -> HALF_UP at scale 6 -> 0.123457
    apply_signal_prices(sessions, {"2024-03-05": Decimal("1.2345675")}, range_end="2024-03-05")
    assert sessions[0].bar.signal_close == "0.123457"
