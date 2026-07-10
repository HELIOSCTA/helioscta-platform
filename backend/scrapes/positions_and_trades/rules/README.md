# Position And Trade Product Rules

The `data/product_definition_catalog.py`, `data/product_alias_catalog.py`, and
`data/account_catalog.py` modules are the backend source for product and
account lookup rules used by `backend.scrapes.positions_and_trades`. The
`engine/` package contains the Python code that interprets those rule
catalogues.

They do not create database objects and are not written back to source tables.
NAV ingestion remains raw-only; product code, group, region, contract, option,
and symbol fields are derived in Python by callers that explicitly use the rule
engine.

Alias rules are source-specific. Keep NAV labels under `source: "nav"` and
Clear Street transaction descriptions under `source: "clear_street"` so source
clearing codes do not become canonical product definitions.

The catalogues group canonical products plus NAV and Clear Street aliases by
product family (`Gas`, `Power`, and `Basis`) so related rules stay near each
other.

Clear Street futures whose security description starts with a canonical
`CODE-` prefix are resolved from that prefix after direct `futures_code` /
`exch_comm_cd` lookup and before description aliases. Keep
`source: "clear_street"` aliases for descriptions that cannot be inferred from
the prefix, such as option descriptions whose source prefix differs from the
canonical option product code.

Account lookup rules are source-specific too. Keep supported production sources
under `source: "nav"` and `source: "clear_street"`. Legacy Marex rows from old
dbt lookup SQL should not be reintroduced unless a current Marex runtime path is
promoted into this repo.
