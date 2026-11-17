"""Session state machine (plan section 5.2) and bar construction (section 5.3)."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP

from ..config import PRICE_SCALE, QUANTITY_SCALE

PRICE_QUANT = Decimal(1).scaleb(-PRICE_SCALE)
QUANTITY_QUANT = Decimal(1).scaleb(-QUANTITY_SCALE)


@dataclass
class QualityIssue:
    code: str
    blocking: bool
    message: str


@dataclass
class Bar:
    date: str
    open: str
    high: str
    low: str
    close: str
    volume: str
    signal_open: str | None = None
    signal_high: str | None = None
    signal_low: str | None = None
    signal_close: str | None = None


@dataclass
class Session:
    date: str
    status: str  # "trading" | "suspended" | "missing"
    bar: Bar | None = None


def quantize_price(value: str) -> str:
    """Quantize a source price string to scale=6.

    Source prices carry at most 4 fraction digits, so this is exact zero-padding
    with no rounding; any input that would actually round is rejected loudly.
    """
    raw = Decimal(value)
    quantized = raw.quantize(PRICE_QUANT, rounding=ROUND_HALF_UP)
    if quantized != raw:
        raise ValueError(f"price {value!r} is not representable at scale {PRICE_SCALE} without rounding")
    return f"{quantized:.{PRICE_SCALE}f}"


def quantize_quantity(value: str) -> str:
    raw = Decimal(value)
    quantized = raw.quantize(QUANTITY_QUANT, rounding=ROUND_HALF_UP)
    if quantized != raw:
        raise ValueError(f"quantity {value!r} is not representable at scale {QUANTITY_SCALE} without rounding")
    return f"{quantized:.{QUANTITY_SCALE}f}"


@dataclass
class SessionBuildResult:
    sessions: list[Session]
    issues: list[QualityIssue] = field(default_factory=list)
    st_dates: list[str] = field(default_factory=list)
    suspended_dates: list[str] = field(default_factory=list)
    zero_volume_dates: list[str] = field(default_factory=list)
    not_listed_dates: list[str] = field(default_factory=list)
    delisted_dates: list[str] = field(default_factory=list)
    unexplained_missing_dates: list[str] = field(default_factory=list)


def build_sessions(
    calendar_days: list[str],
    kdata_rows: list[dict[str, str]],
    *,
    ipo_date: str,
    out_date: str,
) -> SessionBuildResult:
    rows_by_date = {row["date"]: row for row in kdata_rows}
    result = SessionBuildResult(sessions=[])
    issues = result.issues

    for day in calendar_days:
        row = rows_by_date.get(day)
        before_listing = bool(ipo_date) and day < ipo_date
        after_delisting = bool(out_date) and day > out_date

        if row is None:
            result.sessions.append(Session(date=day, status="missing"))
            if before_listing:
                result.not_listed_dates.append(day)
            elif after_delisting:
                result.delisted_dates.append(day)
            else:
                result.unexplained_missing_dates.append(day)
            continue

        if row["tradestatus"] == "0":
            # Suspended: pseudo OHLC (= previous close, volume=0) is stripped
            # entirely and must never enter any bar field.
            result.sessions.append(Session(date=day, status="suspended"))
            result.suspended_dates.append(day)
            if row.get("isST") == "1":
                result.st_dates.append(day)
            continue

        volume = row["volume"]
        bar = Bar(
            date=day,
            open=quantize_price(row["open"]),
            high=quantize_price(row["high"]),
            low=quantize_price(row["low"]),
            close=quantize_price(row["close"]),
            volume=quantize_quantity(volume),
        )
        result.sessions.append(Session(date=day, status="trading", bar=bar))
        if volume == "0":
            result.zero_volume_dates.append(day)
        if row.get("isST") == "1":
            result.st_dates.append(day)

    if result.unexplained_missing_dates:
        issues.append(QualityIssue(
            "MISSING_SESSIONS",
            True,
            f"calendar trading days without raw rows and without listing/delisting explanation: "
            f"{len(result.unexplained_missing_dates)} day(s), first 10: {result.unexplained_missing_dates[:10]}",
        ))
    if result.not_listed_dates:
        issues.append(QualityIssue(
            "NOT_LISTED_AT_START",
            True,
            f"range starts before IPO date {ipo_date}: {len(result.not_listed_dates)} pre-listing session(s)",
        ))
    if result.delisted_dates:
        issues.append(QualityIssue(
            "DELISTED_IN_RANGE",
            True,
            f"range extends past delisting date {out_date}: {len(result.delisted_dates)} post-delisting session(s)",
        ))
    if result.st_dates:
        issues.append(QualityIssue(
            "ST_SESSIONS_PRESENT",
            False,
            f"{len(result.st_dates)} ST session(s) in range; first 10: {result.st_dates[:10]}",
        ))
    if result.zero_volume_dates:
        issues.append(QualityIssue(
            "ZERO_VOLUME_TRADING_DAY",
            False,
            f"tradestatus=1 with volume=0 on {len(result.zero_volume_dates)} day(s): {result.zero_volume_dates[:10]}",
        ))
    if result.suspended_dates:
        issues.append(QualityIssue(
            "SUSPENDED_SESSIONS_PRESENT",
            False,
            f"{len(result.suspended_dates)} suspended session(s) in range; first 10: {result.suspended_dates[:10]}",
        ))

    return result
