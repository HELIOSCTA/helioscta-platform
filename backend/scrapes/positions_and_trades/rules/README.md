# Position And Trade Product Rules

These JSON files are the backend source for product lookup and normalization
rules used by `backend.scrapes.positions_and_trades`.

They do not create database objects and are not written back to source tables.
NAV ingestion remains raw-only; product code, group, region, contract, option,
and symbol fields are derived in Python by callers that explicitly use the rule
engine.

Alias rules are source-specific. Keep NAV labels under `source: "nav"` and
Clear Street transaction descriptions under `source: "clear_street"` so source
clearing codes do not become canonical product definitions.
