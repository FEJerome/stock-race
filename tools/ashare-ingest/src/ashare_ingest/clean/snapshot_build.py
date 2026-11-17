"""Assemble the pre-digest prepared snapshot JSON (plan section 5.1/9)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..codes import NormalizedCode
from ..config import (
    ADJUSTMENT_FORMULA_VERSION,
    ADJUSTMENT_RAW,
    CALENDAR_ASSUMPTION_NOTE,
    DIGEST_PLACEHOLDER,
    OBSERVATION_KIND,
    PRICE_SCALE,
    SNAPSHOT_VERSION,
    TOOL_VERSION,
    USAGE_RESTRICTION,
    VOLUME_UNIT,
)
from .corporate_actions import BonusIssueAction, CashDividendAction, CorporateAction
from .sessions import QualityIssue, Session


@dataclass
class SourceRef:
    name: str
    interface: str
    library_version: str


def build_prepared_snapshot(
    *,
    code: NormalizedCode,
    status: str,
    sessions: list[Session],
    actions: list[CorporateAction],
    sources: list[SourceRef],
    issues: list[QualityIssue],
    range_start: str,
    range_end: str,
) -> dict[str, Any]:
    def session_json(session: Session) -> dict[str, Any]:
        item: dict[str, Any] = {"date": session.date, "status": session.status}
        if session.bar is not None:
            bar: dict[str, Any] = {
                "date": session.bar.date,
                "open": session.bar.open,
                "high": session.bar.high,
                "low": session.bar.low,
                "close": session.bar.close,
                "volume": session.bar.volume,
            }
            if session.bar.signal_open is not None:
                bar["signalOpen"] = session.bar.signal_open
                bar["signalHigh"] = session.bar.signal_high
                bar["signalLow"] = session.bar.signal_low
                bar["signalClose"] = session.bar.signal_close
            item["bar"] = bar
        return item

    def action_json(action: CorporateAction) -> dict[str, Any]:
        if isinstance(action, CashDividendAction):
            return {
                "type": "cashDividend",
                "recordDate": action.record_date,
                "exDate": action.ex_date,
                "payDate": action.pay_date,
                "cashPerShare": action.cash_per_share,
            }
        assert isinstance(action, BonusIssueAction)
        return {
            "type": "bonusIssue",
            "recordDate": action.record_date,
            "exDate": action.ex_date,
            "listingDate": action.listing_date,
            "ratioNumerator": action.ratio_numerator,
            "ratioDenominator": action.ratio_denominator,
        }

    snapshot: dict[str, Any] = {
        "snapshotVersion": SNAPSHOT_VERSION,
        "digest": DIGEST_PLACEHOLDER,
        "assetIdentity": {
            "assetId": code.asset_id,
            "type": "stock",
            "sourceTypeRaw": "cn-a-share",
            "status": status,
        },
        "observationKind": OBSERVATION_KIND,
        "sessions": [session_json(session) for session in sessions],
        "corporateActions": [action_json(action) for action in actions],
        "source": [
            {"name": ref.name, "interface": ref.interface, "libraryVersion": ref.library_version}
            for ref in sources
        ],
        "fixedRange": {"start": range_start, "end": range_end},
        "adjustment": ADJUSTMENT_RAW,
        "pricePrecision": PRICE_SCALE,
        "volumeUnit": VOLUME_UNIT,
        "qualityIssues": [
            {"code": issue.code, "blocking": issue.blocking, "message": issue.message}
            for issue in issues
        ],
        "usageRestriction": USAGE_RESTRICTION,
    }
    return snapshot


def dump_json_bytes(payload: dict[str, Any]) -> bytes:
    """Deterministic serialization: same input -> same bytes (idempotency)."""
    return (json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _safe_name(asset_id: str) -> str:
    """assetIds contain ':' which is illegal in Windows filenames (NTFS ADS)."""
    return asset_id.replace(":", "_")


def write_prepared_snapshot(snapshot: dict[str, Any], prepared_dir: Path, code: NormalizedCode, range_start: str, range_end: str) -> Path:
    prepared_dir.mkdir(parents=True, exist_ok=True)
    target = prepared_dir / f"{_safe_name(code.asset_id)}-{range_start}-{range_end}.prepared.json"
    target.write_bytes(dump_json_bytes(snapshot))
    return target


def build_import_manifest(
    *,
    code: NormalizedCode,
    range_start: str,
    range_end: str,
    import_run_id: str,
    raw_inputs: list[dict[str, Any]],
    reconcile_report: str,
    selection_rationale: str,
    selected_at: str,
) -> dict[str, Any]:
    return {
        "snapshotDigest": DIGEST_PLACEHOLDER,  # overwritten by the TS materializer
        "assetId": code.asset_id,
        "fixedRange": {"start": range_start, "end": range_end},
        "adjustmentFormula": ADJUSTMENT_FORMULA_VERSION,
        "toolVersion": TOOL_VERSION,
        "importRunId": import_run_id,
        "rawInputs": raw_inputs,
        "reconcileReport": reconcile_report,
        "selectionRationale": selection_rationale,
        "selectedAt": selected_at,
        "notes": CALENDAR_ASSUMPTION_NOTE,
    }
