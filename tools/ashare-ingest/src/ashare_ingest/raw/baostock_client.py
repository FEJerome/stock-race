"""Baostock fetch client (imports the library lazily; never at package import).

All functions return ``(header, rows)`` with rows as lists of strings so the
archive layer can persist the source response verbatim.
"""

from __future__ import annotations

import time
from typing import Any, Callable

from ..config import MAX_CALL_RETRIES

_SOURCE = "baostock"


def library_version() -> str:
    import baostock as bs

    return str(getattr(bs, "__version__", "unknown"))


def login(max_retries: int = MAX_CALL_RETRIES) -> Any:
    """Anonymous Baostock login; slow (18-60s) is normal, so retry patiently."""
    import baostock as bs

    last_error = "unknown"
    for attempt in range(1, max_retries + 1):
        result = bs.login()
        if result.error_code == "0":
            return bs
        last_error = f"{result.error_code}: {result.error_msg}"
        if attempt < max_retries:
            time.sleep(2 ** attempt)
    raise RuntimeError(f"baostock login failed after {max_retries} attempts: {last_error}")


def logout(bs: Any) -> None:
    try:
        bs.logout()
    except Exception:  # noqa: BLE001 - logout failure must never mask results
        pass


def _run_query(bs: Any, describe: Callable[[], Any], *, retries: int = MAX_CALL_RETRIES) -> tuple[list[str], list[list[str]]]:
    last_error = "unknown"
    for attempt in range(1, retries + 1):
        rs = describe()
        if rs.error_code == "0":
            fields = list(rs.fields)
            rows: list[list[str]] = []
            while rs.next():
                rows.append([str(cell) for cell in rs.get_row_data()])
            return fields, rows
        last_error = f"{rs.error_code}: {rs.error_msg}"
        if attempt < retries:
            time.sleep(2 ** attempt)
    raise RuntimeError(f"baostock query failed after {retries} attempts: {last_error}")


def fetch_trade_dates(bs: Any, start: str, end: str) -> tuple[list[str], list[list[str]]]:
    return _run_query(
        bs,
        lambda: bs.query_trade_dates(start_date=start, end_date=end),
    )


def fetch_kdata(bs: Any, code: str, start: str, end: str, adjustflag: str) -> tuple[list[str], list[list[str]]]:
    fields = "date,code,open,high,low,close,preclose,volume,amount,turn,tradestatus,pctChg,isST"
    return _run_query(
        bs,
        lambda: bs.query_history_k_data_plus(
            code,
            fields,
            start_date=start,
            end_date=end,
            frequency="d",
            adjustflag=adjustflag,
        ),
    )


def fetch_dividend_operate(bs: Any, code: str, year: int) -> tuple[list[str], list[list[str]]]:
    return _run_query(
        bs,
        lambda: bs.query_dividend_data(code=code, year=str(year), yearType="operate"),
    )


def fetch_stock_basic(bs: Any, code: str) -> tuple[list[str], list[list[str]]]:
    return _run_query(
        bs,
        lambda: bs.query_stock_basic(code=code),
    )


__all__ = [
    "_SOURCE",
    "library_version",
    "login",
    "logout",
    "fetch_trade_dates",
    "fetch_kdata",
    "fetch_dividend_operate",
    "fetch_stock_basic",
]
