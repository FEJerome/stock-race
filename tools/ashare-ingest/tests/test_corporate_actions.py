"""Corporate-action mapping tests (plan section 6)."""

from __future__ import annotations

from ashare_ingest.clean.corporate_actions import map_corporate_actions

SESSION_DATES = {"2024-03-04", "2024-03-05", "2024-03-06", "2024-03-07", "2024-03-08"}

ROW = {
    "dividRegistDate": "2024-03-06",
    "dividOperateDate": "2024-03-07",
    "dividPayDate": "2024-03-20",
    "dividStockMarketDate": "2024-03-12",
    "dividCashPsBeforeTax": "0.500",
    "dividCashPsAfterTax": "0.450或0.500",
    "dividStocksPs": "0.250000",
    "dividReserveToStockPs": "0.000000",
}


def _single(row, range_start: str = "2024-03-04", range_end: str = "2024-03-10"):
    actions, issues = map_corporate_actions(
        [row], range_start=range_start, range_end=range_end, session_dates=SESSION_DATES,
    )
    return actions, {issue.code: issue for issue in issues}


def test_cash_and_bonus_split_same_exdate():
    actions, issues = _single(ROW)
    assert issues == {}
    assert len(actions) == 2
    cash = next(a for a in actions if a.type == "cashDividend")
    bonus = next(a for a in actions if a.type == "bonusIssue")
    assert (cash.record_date, cash.ex_date, cash.pay_date) == ("2024-03-06", "2024-03-07", "2024-03-20")
    assert cash.cash_per_share == "0.500000"
    assert (bonus.ratio_numerator, bonus.ratio_denominator) == (1, 4)
    assert bonus.listing_date == "2024-03-12"
    # deterministic ordering: (exDate, type)
    assert [(a.ex_date, a.type) for a in actions] == sorted(
        [(a.ex_date, a.type) for a in actions]
    )


def test_fraction_reduction():
    row = dict(ROW, dividStocksPs="0.500000", dividCashPsBeforeTax="0")
    actions, issues = _single(row)
    assert issues == {}
    bonus = actions[0]
    assert (bonus.ratio_numerator, bonus.ratio_denominator) == (1, 2)


def test_missing_listing_date_blocks():
    row = dict(ROW, dividStockMarketDate="")
    actions, issues = _single(row)
    assert issues["MISSING_BONUS_LISTING_DATE"].blocking is True
    assert all(a.type != "bonusIssue" for a in actions)


def test_exdate_not_a_session_blocks():
    row = dict(ROW, dividOperateDate="2024-03-09")  # weekend, not a session
    actions, issues = _single(row)
    assert issues["EXDATE_NOT_A_SESSION"].blocking is True
    assert actions == []


def test_out_of_range_exdate_ignored():
    row = dict(ROW, dividOperateDate="2025-06-19")
    actions, issues = _single(row)
    assert actions == [] and issues == {}


def test_zero_distribution_produces_nothing():
    row = dict(ROW, dividCashPsBeforeTax="0", dividStocksPs="0", dividReserveToStockPs="0")
    actions, issues = _single(row)
    assert actions == [] and issues == {}
