"""Stock code normalization between user input, Baostock and AKShare forms."""

from __future__ import annotations

from dataclasses import dataclass


class UnsupportedCodeError(ValueError):
    pass


@dataclass(frozen=True)
class NormalizedCode:
    digits: str
    exchange: str  # "sh" | "sz"
    baostock: str  # "sh.600519"
    akshare: str  # "600519"
    asset_id: str  # "stock:cn-a.sh.600519"


def normalize_code(user_input: str) -> NormalizedCode:
    raw = user_input.strip().lower()
    if not raw:
        raise UnsupportedCodeError("empty stock code")

    exchange: str | None = None
    digits: str
    if raw.startswith("sh.") or raw.startswith("sz."):
        exchange, digits = raw[:2], raw[3:]
    elif raw.startswith("sh") or raw.startswith("sz"):
        exchange, digits = raw[:2], raw[2:]
    else:
        digits = raw

    if len(digits) != 6 or not digits.isdigit():
        raise UnsupportedCodeError(f"unrecognized A-share code: {user_input!r}")

    if exchange is None:
        if digits.startswith("6"):
            exchange = "sh"
        elif digits.startswith(("0", "3")):
            exchange = "sz"
        else:
            raise UnsupportedCodeError(
                f"exchange cannot be inferred for {user_input!r}; "
                "Beijing Stock Exchange codes are not supported in this version"
            )

    if exchange == "sh" and not digits.startswith("6"):
        raise UnsupportedCodeError(f"sh exchange requires a 6-leading code: {user_input!r}")
    if exchange == "sz" and not digits.startswith(("0", "3")):
        raise UnsupportedCodeError(f"sz exchange requires a 0/3-leading code: {user_input!r}")

    return NormalizedCode(
        digits=digits,
        exchange=exchange,
        baostock=f"{exchange}.{digits}",
        akshare=digits,
        asset_id=f"stock:cn-a.{exchange}.{digits}",
    )
