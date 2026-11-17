"""Prepared-snapshot shape tests (plan sections 5/9)."""

from __future__ import annotations

import json
from pathlib import Path

from ashare_ingest.clean.snapshot_build import (
    SourceRef,
    build_prepared_snapshot,
    dump_json_bytes,
)
from ashare_ingest.config import DIGEST_PLACEHOLDER
from ashare_ingest.codes import normalize_code


def _minimal_snapshot():
    from ashare_ingest.clean.sessions import Bar, Session
    sessions = [
        Session("2024-03-04", "trading", Bar(
            "2024-03-04", "10.000000", "10.500000", "9.800000", "10.200000", "1000000.000000",
            signal_open="7.600000", signal_high="7.980000",
            signal_low="7.448000", signal_close="7.752000",
        )),
        Session("2024-03-05", "suspended"),
    ]
    return build_prepared_snapshot(
        code=normalize_code("sh.600519"),
        status="active",
        sessions=sessions,
        actions=[],
        sources=[
            SourceRef("baostock", "query_history_k_data_plus", "00.9.40"),
            SourceRef("akshare/eastmoney", "stock_zh_a_hist_em", "1.20.65"),
        ],
        issues=[],
        range_start="2024-03-04",
        range_end="2024-03-08",
    )


def test_prepared_snapshot_shape_matches_schema():
    snapshot = _minimal_snapshot()
    required = {
        "snapshotVersion", "digest", "assetIdentity", "observationKind", "sessions",
        "corporateActions", "source", "fixedRange", "adjustment", "pricePrecision",
        "volumeUnit", "qualityIssues", "usageRestriction",
    }
    assert required == set(snapshot.keys())
    assert snapshot["snapshotVersion"] == "1.0.0"
    assert snapshot["digest"] == DIGEST_PLACEHOLDER
    assert snapshot["assetIdentity"] == {
        "assetId": "stock:cn-a.sh.600519",
        "type": "stock",
        "sourceTypeRaw": "cn-a-share",
        "status": "active",
    }
    assert snapshot["observationKind"] == "ohlcv"
    assert snapshot["adjustment"] == "raw"
    assert snapshot["pricePrecision"] == 6
    assert snapshot["volumeUnit"] == "share"


def test_session_json_omits_bar_for_non_trading():
    snapshot = _minimal_snapshot()
    trading, suspended = snapshot["sessions"]
    assert trading["status"] == "trading"
    assert set(trading["bar"].keys()) == {
        "date", "open", "high", "low", "close", "volume",
        "signalOpen", "signalHigh", "signalLow", "signalClose",
    }
    assert suspended == {"date": "2024-03-05", "status": "suspended"}


def test_dump_is_deterministic():
    first = dump_json_bytes(_minimal_snapshot())
    second = dump_json_bytes(_minimal_snapshot())
    assert first == second
    # round-trips as plain JSON (the only contract across the Python/TS boundary)
    parsed = json.loads(first.decode("utf-8"))
    assert parsed["digest"] == DIGEST_PLACEHOLDER
