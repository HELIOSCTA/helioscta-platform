# ERCOT Public Reports Catalogue

This catalogue tracks ERCOT Public Reports feeds promoted into this production
workspace.

## DAM Settlement Point Prices

- Source system: ERCOT Public Reports API.
- Source product: `NP4-190-CD`, DAM Settlement Point Prices.
- Report Type ID: `12331`.
- Runtime: `backend.scrapes.power.ercot.dam_stlmnt_pnt_prices`.
- Orchestration: `backend.orchestration.power.ercot.dam_stlmnt_pnt_prices`.
- Destination: `ercot.dam_stlmnt_pnt_prices`.
- Primary grain: delivery date x hour ending x settlement point.
- Primary key: `deliverydate`, `hourending`, `settlementpoint`.
- Default runtime scope: `HB_NORTH`, `HB_SOUTH`, `HB_WEST`, `HB_HOUSTON`.
- Safe rerun story: upsert on the primary key.
- Data availability output: `ops.data_availability_events` with event keys in
  the shape `ercot_dam_stlmnt_pnt_prices:data_ready:<YYYY-MM-DD>:hub`.
- dbt folder:
  `dbt/azure_postgres/models/power/ercot/dam_stlmnt_pnt_prices/`.
- Operator SQL:
  `dbt/azure_postgres/models/power/ercot/dam_stlmnt_pnt_prices/table_ercot_dam_stlmnt_pnt_prices.sql`
  and
  `dbt/azure_postgres/models/power/ercot/dam_stlmnt_pnt_prices/index_ercot_dam_stlmnt_pnt_prices.sql`.
- Deployment status: runtime, operator SQL, orchestration, and systemd schedule
  are promoted for VM deployment.
- Production schedule: daily at `16:15 UTC` with `Persistent=true` and
  `RandomizedDelaySec=5min`; the scheduled default pulls the current delivery
  date.
- Manual smoke: conda env `helioscta-platform-backend` ran the orchestration
  for `2026-06-13` on `2026-06-13 16:52 UTC`, upserted 96 hub rows, and
  emitted the complete readiness event.

## RT Settlement Point Prices

- Source system: ERCOT Public Reports API.
- Source product: `NP6-905-CD`, Settlement Point Prices at Resource Nodes,
  Hubs and Load Zones.
- Report Type ID: `12301`.
- Endpoint: `np6-905-cd/spp_node_zone_hub`.
- Runtime: `backend.scrapes.power.ercot.settlement_point_prices`.
- Orchestration: `backend.orchestration.power.ercot.settlement_point_prices`.
- Destination: `ercot.settlement_point_prices`.
- Primary grain: delivery date x delivery hour x delivery interval x
  settlement point.
- Primary key: `deliverydate`, `deliveryhour`, `deliveryinterval`,
  `settlementpoint`.
- Default runtime scope: `HB_NORTH`, `HB_SOUTH`, `HB_WEST`, `HB_HOUSTON`.
- Safe rerun story: upsert on the primary key.
- Data availability output: `ops.data_availability_events` with event keys in
  the shape `ercot_settlement_point_prices:data_ready:<YYYY-MM-DD>:hub`.
- dbt folder:
  `dbt/azure_postgres/models/power/ercot/settlement_point_prices/`.
- Operator SQL:
  `dbt/azure_postgres/models/power/ercot/settlement_point_prices/table_ercot_settlement_point_prices.sql`
  and
  `dbt/azure_postgres/models/power/ercot/settlement_point_prices/index_ercot_settlement_point_prices.sql`.
- Deployment status: runtime, operator SQL, orchestration, and systemd schedule
  are promoted for VM deployment.
- Production schedule: every 15 minutes with `Persistent=false` and
  `RandomizedDelaySec=2min`; partial intraday runs upsert published intervals,
  and readiness is emitted only for complete delivery dates.
- Manual smoke: conda env `helioscta-platform-backend` ran the scrape for
  `2026-06-13` on `2026-06-13 17:02 UTC`, upserted 188 hub rows across 47
  published intervals, and wrote successful ERCOT API telemetry for all four
  hubs.
