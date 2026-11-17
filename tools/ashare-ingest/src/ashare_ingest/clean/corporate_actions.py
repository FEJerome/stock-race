"""Corporate-action mapping from Baostock dividend rows (plan section 6)."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from fractions import Fraction

from ..config import PRICE_SCALE
from .sessions import QualityIssue, quantize_price


@dataclass(frozen=True)
class CashDividendAction:
    type: str  # "cashDividend"
    record_date: str
    ex_date: str
    pay_date: str
    cash_per_share: str  # pre-tax, scale=6 string


@dataclass(frozen=True)
class BonusIssueAction:
    type: str  # "bonusIssue"
    record_date: str
    ex_date: str
    listing_date: str
    ratio_numerator: int
    ratio_denominator: int


CorporateAction = CashDividendAction | BonusIssueAction


def _decimal_field(row: dict[str, str], key: str) -> Decimal:
    raw = (row.get(key) or "").strip()
    if not raw:
        return Decimal(0)
    return Decimal(raw)


def map_corporate_actions(
    dividend_rows: list[dict[str, str]],
    *,
    range_start: str,
    range_end: str,
    session_dates: set[str],
) -> tuple[list[CorporateAction], list[QualityIssue]]:
    """Map Baostock operate-year dividend rows into schema actions.

    Only rows whose ex-date falls inside [range_start, range_end] become
    actions; cash and bonus parts of one distribution split into two entries
    sharing the same ex-date.
    """
    actions: list[CorporateAction] = []
    issues: list[QualityIssue] = []

    for row in dividend_rows:
        ex_date = (row.get("dividOperateDate") or "").strip()
        if not ex_date or not (range_start <= ex_date <= range_end):
            continue
        if ex_date not in session_dates:
            issues.append(QualityIssue(
                "EXDATE_NOT_A_SESSION",
                True,
                f"ex-date {ex_date} is not a calendar session date in the frozen range",
            ))
            continue

        record_date = (row.get("dividRegistDate") or "").strip()
        pay_date = (row.get("dividPayDate") or "").strip()
        listing_date = (row.get("dividStockMarketDate") or "").strip()
        cash = _decimal_field(row, "dividCashPsBeforeTax")
        ratio_per_share = _decimal_field(row, "dividStocksPs") + _decimal_field(row, "dividReserveToStockPs")

        if cash > 0:
            actions.append(CashDividendAction(
                type="cashDividend",
                record_date=record_date,
                ex_date=ex_date,
                pay_date=pay_date,
                cash_per_share=quantize_price(str(cash)),
            ))

        if ratio_per_share > 0:
            if not listing_date:
                issues.append(QualityIssue(
                    "MISSING_BONUS_LISTING_DATE",
                    True,
                    f"bonus issue on ex-date {ex_date} has no dividStockMarketDate; "
                    "listing date must not be guessed",
                ))
                continue
            ratio = Fraction(ratio_per_share)
            actions.append(BonusIssueAction(
                type="bonusIssue",
                record_date=record_date,
                ex_date=ex_date,
                listing_date=listing_date,
                ratio_numerator=ratio.numerator,
                ratio_denominator=ratio.denominator,
            ))

    actions.sort(key=lambda item: (item.ex_date, item.type))
    return actions, issues


def decimal_ratio(action: BonusIssueAction) -> Decimal:
    return Decimal(action.ratio_numerator) / Decimal(action.ratio_denominator)
