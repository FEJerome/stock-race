"""Point-in-time adjustment (adjustment-formula@1, plan section 7).

Anchor E = fixedRange.end (the frozen data cutoff at import time, never a
run-time endpoint). For each ex-date e the single-day factor is

    f_e = (C_prev(e) - cash_e) / C_prev(e) / (1 + ratio_e)

with C_prev(e) the raw close of the last *trading* session before e. The
cumulative factor for session date d is the product of f_e over ex-dates with
d < e <= E; signal(d) = HALF_UP_6(raw(d) * AF(d)).
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, getcontext

from ..config import PRICE_SCALE
from .corporate_actions import BonusIssueAction, CashDividendAction, CorporateAction, decimal_ratio
from .sessions import QualityIssue, Session, quantize_price

getcontext().prec = 40


def _combine_actions(actions: list[CorporateAction]) -> dict[str, tuple[Decimal, Decimal]]:
    """ex-date -> (total pre-tax cash per share, total bonus ratio per share)."""
    combined: dict[str, tuple[Decimal, Decimal]] = {}
    for action in actions:
        cash, ratio = combined.get(action.ex_date, (Decimal(0), Decimal(0)))
        if isinstance(action, CashDividendAction):
            cash += Decimal(action.cash_per_share)
        elif isinstance(action, BonusIssueAction):
            ratio += decimal_ratio(action)
        combined[action.ex_date] = (cash, ratio)
    return combined


def compute_daily_factors(
    actions: list[CorporateAction],
    sessions: list[Session],
    *,
    range_end: str,
) -> tuple[dict[str, Decimal], list[QualityIssue]]:
    """Return per-ex-date single-day factors plus any blocking issues."""
    issues: list[QualityIssue] = []
    combined = _combine_actions(actions)

    factors: dict[str, Decimal] = {}
    for ex_date in sorted(combined):
        cash, ratio = combined[ex_date]
        prior_closes = [Decimal(session.bar.close) for session in sessions
                        if session.status == "trading" and session.bar and session.date < ex_date]
        if not prior_closes:
            issues.append(QualityIssue(
                "EXDATE_NO_PRIOR_TRADING_SESSION",
                True,
                f"ex-date {ex_date} has no prior trading session for C_prev",
            ))
            continue
        c_prev = prior_closes[-1]
        factor = (c_prev - cash) / c_prev / (Decimal(1) + ratio)
        factors[ex_date] = factor

    return factors, issues


def adjustment_factor_for(date: str, factors: dict[str, Decimal], *, range_end: str) -> Decimal:
    """AF(d) = product of f_e for ex-dates e with d < e <= range_end."""
    factor = Decimal(1)
    for ex_date in factors:
        if date < ex_date <= range_end:
            factor *= factors[ex_date]
    return factor


def apply_signal_prices(sessions: list[Session], factors: dict[str, Decimal], *, range_end: str) -> None:
    """Write explicit signalOpen/High/Low/Close (scale=6, HALF_UP) onto bars.

    Signal values are always written, even where they equal raw prices, so
    consumers never fall back to `?? open` and silently mix semantics.
    """
    quant = Decimal(1).scaleb(-PRICE_SCALE)

    def signal(raw: str, factor: Decimal) -> str:
        value = Decimal(raw) * factor
        return str(value.quantize(quant, rounding=ROUND_HALF_UP))

    for session in sessions:
        if session.status != "trading" or session.bar is None:
            continue
        factor = adjustment_factor_for(session.date, factors, range_end=range_end)
        bar = session.bar
        bar.signal_open = signal(bar.open, factor)
        bar.signal_high = signal(bar.high, factor)
        bar.signal_low = signal(bar.low, factor)
        bar.signal_close = signal(bar.close, factor)
