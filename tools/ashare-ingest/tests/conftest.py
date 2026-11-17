"""Shared test helpers: assemble a raw run directory (with manifest) from a fixture set."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from ashare_ingest.raw.archive import sha256_file

FIXTURES = Path(__file__).parent / "fixtures"

CALL_META = {
    "bs-trade-dates-{tag}": ("baostock", "query_trade_dates"),
    "bs-{digits}-{tag}-raw": ("baostock", "query_history_k_data_plus"),
    "bs-{digits}-{tag}-qfq": ("baostock", "query_history_k_data_plus"),
    "bs-{digits}-dividend-{year}-operate": ("baostock", "query_dividend_data"),
    "bs-{digits}-basic": ("baostock", "query_stock_basic"),
    "ak-em-{digits}-{tag}-raw": ("akshare/eastmoney", "stock_zh_a_hist_em"),
    "ak-{digits}-dividend-detail": ("akshare/eastmoney", "stock_history_dividend_detail"),
}

LIBRARY_VERSIONS = {
    "baostock": "00.9.40",
    "akshare/eastmoney": "1.20.65",
}


def assemble_run_dir(tmp_path: Path, fixture_name: str, run_id: str = "20240308T000000Z-test") -> Path:
    """Copy a fixture set into a raw run dir and synthesize its manifest."""
    source = FIXTURES / fixture_name
    run_dir = tmp_path / "raw" / run_id
    run_dir.mkdir(parents=True)
    calls = []
    for file in sorted(source.iterdir()):
        if not file.is_file():
            continue
        shutil.copy2(file, run_dir / file.name)
        source_name, interface = _meta_for(file.name)
        calls.append({
            "name": file.name.rsplit(".", 1)[0],
            "source": source_name,
            "interface": interface,
            "libraryVersion": LIBRARY_VERSIONS[source_name],
            "params": {},
            "capturedAt": "2024-03-08T00:00:00+0800",
            "call": "pass",
            "rows": 0,
            "rawFile": file.name,
            "rawSha256": sha256_file(run_dir / file.name),
            "error": None,
            "notes": "hand-authored fixture",
        })
    (run_dir / "manifest.json").write_text(
        json.dumps({
            "importRunId": run_id,
            "toolVersion": "ashare-ingest@0.1.0",
            "calls": calls,
        }, ensure_ascii=True, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return run_dir


def _meta_for(filename: str) -> tuple[str, str]:
    stem = filename.rsplit(".", 1)[0]
    import re

    for pattern, meta in CALL_META.items():
        regex = re.compile("^" + re.escape(pattern)
                           .replace(r"\{tag\}", ".+")
                           .replace(r"\{digits\}", r"\d{6}")
                           .replace(r"\{year\}", r"\d{4}") + "$")
        if regex.match(stem):
            return meta
    raise ValueError(f"no manifest metadata registered for fixture file {filename}")
