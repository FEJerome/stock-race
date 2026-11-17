"""Raw archive: verbatim CSV capture plus per-call manifest evidence."""

from __future__ import annotations

import csv
import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc_run_id(now: datetime | None = None) -> str:
    moment = now or datetime.now().astimezone()
    stamp = moment.astimezone().strftime("%Y%m%dT%H%M%SZ")
    # Randomness comes from the caller-provided clock jitter via secrets in cli.
    return stamp


@dataclass
class ManifestRecorder:
    """Accumulates per-call evidence and writes manifest.json once per run."""

    import_run_id: str
    tool_version: str
    calls: list[dict[str, Any]] = field(default_factory=list)

    def record(
        self,
        *,
        name: str,
        source: str,
        interface: str,
        library_version: str,
        params: dict[str, Any],
        raw_path: Path | None,
        rows: int | None,
        call: str,
        error: str | None = None,
        notes: str | None = None,
    ) -> None:
        entry: dict[str, Any] = {
            "name": name,
            "source": source,
            "interface": interface,
            "libraryVersion": library_version,
            "params": params,
            "capturedAt": datetime.now().astimezone().strftime("%Y-%m-%dT%H:%M:%S%z"),
            "call": call,
            "rows": rows,
            "rawFile": raw_path.name if raw_path else None,
            "rawSha256": sha256_file(raw_path) if raw_path else None,
            "error": error,
            "notes": notes,
        }
        self.calls.append(entry)

    def save(self, run_dir: Path) -> Path:
        payload = {
            "importRunId": self.import_run_id,
            "toolVersion": self.tool_version,
            "calls": self.calls,
        }
        target = run_dir / "manifest.json"
        target.write_text(
            json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        return target


def write_csv(run_dir: Path, filename: str, header: list[str], rows: list[list[str]]) -> Path:
    """Write a raw evidence CSV verbatim (no rename/reorder/trim)."""
    target = run_dir / filename
    with target.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)
    return target


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        header = list(reader.fieldnames or [])
        rows = [{key: (value if value is not None else "") for key, value in row.items()} for row in reader]
    return header, rows
