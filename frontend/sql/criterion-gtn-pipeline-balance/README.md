# Criterion GTN Pipeline Balance

Local DEV-only Snowflake report for GTN pipeline balance.

Source system: Criterion Snowflake `PRODUCTION.PIPELINES`.

Primary source tables:

- `PIPELINES.METADATA` at `TSP_SHORT x METADATA_ID` point grain.
- `PIPELINES.NOMINATION_POINTS` at `TSP_SHORT x EFF_GAS_DAY x CYCLE_ID x METADATA_ID`.
- `PIPELINES.NOMINATION_SEGMENTS` at `TSP_SHORT x EFF_GAS_DAY x CYCLE_ID x METADATA_ID`.
- `PIPELINES.MAX_POINT_FLOW` for historical point-flow context in verification.

Required pipeline key: `TSP_SHORT = '079'`.

Gas-day policy:

- The API defaults to the latest GTN gas day with Intraday 3 (`CYCLE_ID = 5`)
  coverage for required plant and segment mappings.
- Explicit dates use the latest available cycle for that date, so current-day
  Evening-cycle data can be inspected without treating it as complete.

Runtime templates under `runtime/` use Snowflake bind variables and are executed
by `GET /api/criterion/gtn-pipeline-balance`.

Verification templates under `verification/` are worksheet-friendly SQL packs.
Edit the `params` CTE date before running.

Plant MW values are estimated from scheduled gas nominations using the exposed
`assumed_heat_rate_mmbtu_per_mwh` mapping value. They are not metered power
generation.
