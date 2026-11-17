"""ashare-ingest: real A-share data importer for stock-race v3 snapshots.

Pipeline: fetch (online, opt-in) -> raw archive with manifest -> clean/reconcile
(offline) -> prepared pre-digest JSON. The frozen snapshot digest is computed
only by the TypeScript `import-snapshot` materializer (single source of truth).
"""

__version__ = "0.1.0"
