"""Cross-source reconciliation (plan section 8): compare only, never average."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP

from ..config import (
    AMOUNT_TOLERANCE_YUAN,
    PRECLOSE_TOLERANCE_YUAN,
    VOLUME_TOLERANCE_SHARES,
)
from .adjust import adjustment_factor_for
from .corporate_actions import BonusIssueAction, CorporateAction, CashDividendAction, decimal_ratio
from .sessions import QualityIssue, Session, quantize_price

_AK_OHLC = {"open": "开盘", "high": "最高", "low": "最低", "close": "收盘"}


@dataclass
class CheckResult:
    name: str
    passed: bool
    detail: str


@dataclass
class ReconcileReport:
    asset_id: str
    checks: list[CheckResult] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(check.passed for check in self.checks)


def _trading_rows_by_date(kdata_rows: list[dict[str, str]]) -> dict[str, dict[str, str]]:
    return {row["date"]: row for row in kdata_rows if row.get("tradestatus") == "1"}


def reconcile_coverage(bs_rows: list[dict[str, str]], ak_rows: list[dict[str, str]]) -> CheckResult:
    bs_dates = set(_trading_rows_by_date(bs_rows))
    ak_dates = {row["日期"] for row in ak_rows}
    missing_in_ak = sorted(bs_dates - ak_dates)
    missing_in_bs = sorted(ak_dates - bs_dates)
    passed = not missing_in_ak and not missing_in_bs
    detail = (
        f"bs trading days={len(bs_dates)}, ak days={len(ak_dates)}; "
        f"only-in-bs={missing_in_ak[:10]}, only-in-ak={missing_in_bs[:10]}"
    )
    return CheckResult("trading-day coverage", passed, detail)


def reconcile_ohlc(bs_rows: list[dict[str, str]], ak_rows: list[dict[str, str]]) -> CheckResult:
    bs_by_date = _trading_rows_by_date(bs_rows)
    ak_by_date = {row["日期"]: row for row in ak_rows}
    mismatches: list[str] = []
    for date in sorted(set(bs_by_date) & set(ak_by_date)):
        bs_row, ak_row = bs_by_date[date], ak_by_date[date]
        for field, ak_field in _AK_OHLC.items():
            if quantize_price(bs_row[field]) != quantize_price(ak_row[ak_field]):
                mismatches.append(f"{date}.{field}: bs={bs_row[field]} ak={ak_row[ak_field]}")
    return CheckResult(
        "OHLC exact match",
        not mismatches,
        f"mismatched field-days={len(mismatches)}; first 10: {mismatches[:10]}",
    )


def reconcile_volume(bs_rows: list[dict[str, str]], ak_rows: list[dict[str, str]]) -> CheckResult:
    bs_by_date = _trading_rows_by_date(bs_rows)
    ak_by_date = {row["日期"]: row for row in ak_rows}
    diffs: list[Decimal] = []
    worst: str | None = None
    for date in sorted(set(bs_by_date) & set(ak_by_date)):
        bs_volume = Decimal(bs_by_date[date]["volume"])
        ak_volume = Decimal(ak_by_date[date]["成交量"]) * 100  # lots -> shares
        diff = abs(bs_volume - ak_volume)
        diffs.append(diff)
        if diff > VOLUME_TOLERANCE_SHARES and worst is None:
            worst = f"{date}: bs={bs_volume} ak_lotsx100={ak_volume} diff={diff}"
    max_diff = max(diffs) if diffs else Decimal(0)
    mean_diff = (sum(diffs) / len(diffs)) if diffs else Decimal(0)
    return CheckResult(
        "volume (ak lots x100) tolerance 100 shares",
        worst is None,
        f"max|diff|={max_diff} shares, mean|diff|={mean_diff.quantize(Decimal('0.0001'))}; first breach: {worst}",
    )


def reconcile_amount(bs_rows: list[dict[str, str]], ak_rows: list[dict[str, str]]) -> CheckResult:
    bs_by_date = _trading_rows_by_date(bs_rows)
    ak_by_date = {row["日期"]: row for row in ak_rows}
    diffs: list[Decimal] = []
    worst: str | None = None
    for date in sorted(set(bs_by_date) & set(ak_by_date)):
        bs_amount = Decimal(bs_by_date[date]["amount"])
        ak_amount = Decimal(ak_by_date[date]["成交额"])
        diff = abs(bs_amount - ak_amount)
        diffs.append(diff)
        if diff > AMOUNT_TOLERANCE_YUAN and worst is None:
            worst = f"{date}: bs={bs_amount} ak={ak_amount} diff={diff}"
    max_diff = max(diffs) if diffs else Decimal(0)
    mean_diff = (sum(diffs) / len(diffs)) if diffs else Decimal(0)
    return CheckResult(
        "amount tolerance 0.5 yuan",
        worst is None,
        f"max|diff|={max_diff.quantize(Decimal('0.0001'))} yuan, mean={mean_diff.quantize(Decimal('0.0001'))}; first breach: {worst}",
    )


def reconcile_dividends(
    actions: list[CorporateAction],
    ak_dividend_rows: list[dict[str, str]],
    *,
    range_start: str,
    range_end: str,
) -> CheckResult:
    """Cross-check cash dividends (ak 派息 is per 10 shares -> /10 per share)."""
    cash_actions = [a for a in actions if isinstance(a, CashDividendAction)]
    bonus_actions = [a for a in actions if isinstance(a, BonusIssueAction)]
    ak_by_ex = {(row.get("除权除息日") or "").strip(): row for row in ak_dividend_rows}
    mismatches: list[str] = []
    for action in cash_actions:
        ak_row = ak_by_ex.get(action.ex_date)
        if ak_row is None:
            mismatches.append(f"{action.ex_date}: no ak dividend row")
            continue
        ak_per_share = Decimal((ak_row.get("派息") or "0").strip() or "0") / Decimal(10)
        if ak_per_share != Decimal(action.cash_per_share):
            mismatches.append(
                f"{action.ex_date}: bs={action.cash_per_share} ak_per_share={ak_per_share}"
            )
        ak_record = (ak_row.get("股权登记日") or "").strip()
        if action.record_date and ak_record and ak_record != action.record_date:
            mismatches.append(f"{action.ex_date}: record bs={action.record_date} ak={ak_record}")
    for action in bonus_actions:
        ak_row = ak_by_ex.get(action.ex_date)
        if ak_row is None:
            mismatches.append(f"{action.ex_date}: no ak dividend row for bonus")
            continue
        # akshare 送股/转增 columns are per 10 shares (assumption recorded here).
        ak_per_share = (
            Decimal((ak_row.get("送股") or "0").strip() or "0")
            + Decimal((ak_row.get("转增") or "0").strip() or "0")
        ) / Decimal(10)
        if ak_per_share != decimal_ratio(action):
            mismatches.append(
                f"{action.ex_date}: bs_ratio={decimal_ratio(action)} ak_per_share={ak_per_share} (ak/10)"
            )
        ak_listing = (ak_row.get("红股上市日") or "").strip()
        if ak_listing and ak_listing != action.listing_date:
            mismatches.append(f"{action.ex_date}: listing bs={action.listing_date} ak={ak_listing}")
    # Reverse direction: ak rows inside the range with cash/bonus must map to bs actions.
    bs_ex_dates = {action.ex_date for action in actions}
    for ex_date, ak_row in sorted(ak_by_ex.items()):
        if not (range_start <= ex_date <= range_end):
            continue
        ak_cash = Decimal((ak_row.get("派息") or "0").strip() or "0")
        ak_bonus = Decimal((ak_row.get("送股") or "0").strip() or "0") + Decimal(
            (ak_row.get("转增") or "0").strip() or "0"
        )
        if (ak_cash > 0 or ak_bonus > 0) and ex_date not in bs_ex_dates:
            mismatches.append(f"{ex_date}: ak dividend has no baostock action")
    return CheckResult(
        "cash dividend cross-check (ak 派息/10 = per share)",
        not mismatches,
        f"checked={len(cash_actions)} cash + {len(bonus_actions)} bonus action(s); mismatches={mismatches[:10]}",
    )


def reconcile_preclose(
    bs_rows: list[dict[str, str]],
    actions: list[CorporateAction],
    sessions: list[Session],
) -> CheckResult:
    """| (C_prev(e) - cash) / (1 + ratio) - bs_preclose(e) | <= 0.005 per ex-date."""
    bs_by_date = {row["date"]: row for row in bs_rows}
    combined: dict[str, tuple[Decimal, Decimal]] = {}
    for action in actions:
        cash, ratio = combined.get(action.ex_date, (Decimal(0), Decimal(0)))
        if isinstance(action, CashDividendAction):
            cash += Decimal(action.cash_per_share)
        elif isinstance(action, BonusIssueAction):
            ratio += decimal_ratio(action)
        combined[action.ex_date] = (cash, ratio)

    breaches: list[str] = []
    checked = 0
    for ex_date in sorted(combined):
        row = bs_by_date.get(ex_date)
        if row is None:
            continue
        cash, ratio = combined[ex_date]
        prior = [Decimal(s.bar.close) for s in sessions
                 if s.status == "trading" and s.bar and s.date < ex_date]
        if not prior:
            continue
        checked += 1
        theoretical = (prior[-1] - cash) / (Decimal(1) + ratio)
        actual = Decimal(row["preclose"])
        if abs(theoretical - actual) > PRECLOSE_TOLERANCE_YUAN:
            breaches.append(f"{ex_date}: theoretical={theoretical} preclose={actual}")
    return CheckResult(
        "preclose arithmetic tolerance 0.005",
        not breaches,
        f"checked={checked} ex-date(s); breaches={breaches}",
    )


def reconcile_signal_vs_qfq(
    sessions: list[Session],
    factors: dict[str, Decimal],
    qfq_rows: list[dict[str, str]],
    *,
    range_end: str,
) -> CheckResult:
    """Informational: max |signal_close - source qfq_close| (never blocks).

    Source qfq anchors at query day, so post-range dividends widen this
    deviation by design; it exists only to eyeball formula correctness. The
    expected signal is recomputed here because reconciliation runs before
    signal prices are applied to the sessions.
    """
    qfq_close = {row["date"]: Decimal(row["close"]) for row in qfq_rows}
    quant = Decimal(1).scaleb(-6)
    max_diff = Decimal(0)
    max_date: str | None = None
    compared = 0
    for session in sessions:
        if session.status != "trading" or session.bar is None:
            continue
        qfq = qfq_close.get(session.date)
        if qfq is None:
            continue
        factor = adjustment_factor_for(session.date, factors, range_end=range_end)
        expected_signal = (Decimal(session.bar.close) * factor).quantize(quant, rounding=ROUND_HALF_UP)
        diff = abs(expected_signal - qfq)
        compared += 1
        if diff > max_diff:
            max_diff = diff
            max_date = session.date
    return CheckResult(
        "signal vs source qfq max deviation (informational)",
        True,
        f"compared={compared} day(s); max|signal_close - qfq_close|="
        f"{max_diff.quantize(Decimal('0.000001'))} at {max_date}; "
        "qfq anchors at query day and is excluded from the snapshot",
    )


def reconcile_all(
    *,
    asset_id: str,
    bs_rows: list[dict[str, str]],
    qfq_rows: list[dict[str, str]],
    ak_rows: list[dict[str, str]],
    ak_dividend_rows: list[dict[str, str]],
    actions: list[CorporateAction],
    sessions: list[Session],
    factors: dict[str, Decimal],
    range_start: str,
    range_end: str,
) -> ReconcileReport:
    report = ReconcileReport(asset_id=asset_id)
    report.checks.append(reconcile_coverage(bs_rows, ak_rows))
    report.checks.append(reconcile_ohlc(bs_rows, ak_rows))
    report.checks.append(reconcile_volume(bs_rows, ak_rows))
    report.checks.append(reconcile_amount(bs_rows, ak_rows))
    report.checks.append(reconcile_dividends(actions, ak_dividend_rows, range_start=range_start, range_end=range_end))
    report.checks.append(reconcile_preclose(bs_rows, actions, sessions))
    report.checks.append(reconcile_signal_vs_qfq(sessions, factors, qfq_rows, range_end=range_end))
    return report


def blocking_issues_from_report(report: ReconcileReport) -> list[QualityIssue]:
    if report.passed:
        return []
    failed = [check.name for check in report.checks if not check.passed]
    return [QualityIssue(
        "RECONCILE_MISMATCH",
        True,
        f"cross-source reconciliation failed: {', '.join(failed)}; no snapshot may be produced",
    )]
