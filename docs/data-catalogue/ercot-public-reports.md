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

## Actual System Load

- Source system: ERCOT Public Reports API.
- Source product: `NP6-346-CD`, Actual System Load by Forecast Zone.
- Endpoint: `np6-346-cd/act_sys_load_by_fzn`.
- Runtime: `backend.scrapes.power.ercot.actual_system_load`.
- Batch orchestration: `backend.orchestration.power.ercot.load_batch`.
- Destination: `ercot.actual_system_load`.
- Primary grain: operating day x hour ending.
- Primary key: `operatingday`, `hourending`.
- Safe rerun story: upsert on the primary key.
- dbt folder:
  `dbt/azure_postgres/models/power/ercot/actual_system_load/`.
- Operator SQL:
  `dbt/azure_postgres/models/power/ercot/actual_system_load/table_ercot_actual_system_load.sql`
  and
  `dbt/azure_postgres/models/power/ercot/actual_system_load/index_ercot_actual_system_load.sql`.
- Production schedule: through `helios-ercot-load-batch.timer`, daily at
  `12:20 UTC` with `Persistent=true` and `RandomizedDelaySec=10min`; the
  scheduled default pulls complete operating days through yesterday.
- Manual smoke: conda env `helioscta-platform-backend` ran the scrape for
  `2026-06-12` on `2026-06-13 17:48 UTC`, upserted 24 hourly rows, and wrote
  successful ERCOT API telemetry.

## Seven-Day Load Forecast

- Source system: ERCOT Public Reports API.
- Source product: `NP3-565-CD`, Seven-Day Load Forecast by Model and Weather
  Zone.
- Endpoint: `np3-565-cd/lf_by_model_weather_zone`.
- Runtime: `backend.scrapes.power.ercot.seven_day_load_forecast`.
- Batch orchestration: `backend.orchestration.power.ercot.load_batch`.
- Destination: `ercot.seven_day_load_forecast`.
- Primary grain: posted datetime x delivery date x hour ending x model.
- Primary key: `posteddatetime`, `deliverydate`, `hourending`, `model`.
- Safe rerun story: upsert on the primary key.
- dbt folder:
  `dbt/azure_postgres/models/power/ercot/seven_day_load_forecast/`.
- Operator SQL:
  `dbt/azure_postgres/models/power/ercot/seven_day_load_forecast/table_ercot_seven_day_load_forecast.sql`
  and
  `dbt/azure_postgres/models/power/ercot/seven_day_load_forecast/index_ercot_seven_day_load_forecast.sql`.
- Production schedule: through `helios-ercot-load-batch.timer`, daily at
  `12:20 UTC` with `Persistent=true` and `RandomizedDelaySec=10min`.
- Manual smoke: conda env `helioscta-platform-backend` ran the scrape for
  delivery date `2026-06-13` on `2026-06-13 17:48 UTC`, upserted 4,344 rows,
  and wrote successful ERCOT API telemetry.

## DAM Shadow Prices

- Source system: ERCOT Public Reports API.
- Source product: `NP4-191-CD`, DAM Shadow Prices.
- Report Type ID: `12332`.
- Endpoint: `np4-191-cd/dam_shadow_prices`.
- Runtime: `backend.scrapes.power.ercot.dam_shadow_prices`.
- Batch orchestration: `backend.orchestration.power.ercot.congestion_batch`.
- Destination: `ercot.dam_shadow_prices`.
- Primary grain: delivery timestamp x constraint id x constraint name x
  contingency name.
- Primary key: `deliverytime`, `constraintid`, `constraintname`,
  `contingencyname`.
- Safe rerun story: upsert on the primary key.
- dbt folder:
  `dbt/azure_postgres/models/power/ercot/dam_shadow_prices/`.
- Operator SQL:
  `dbt/azure_postgres/models/power/ercot/dam_shadow_prices/table_ercot_dam_shadow_prices.sql`
  and
  `dbt/azure_postgres/models/power/ercot/dam_shadow_prices/index_ercot_dam_shadow_prices.sql`.
- Production schedule: through `helios-ercot-congestion-batch.timer`, daily at
  `12:45 UTC` with `Persistent=true` and `RandomizedDelaySec=10min`; the
  scheduled default pulls the prior complete delivery date.

## SCED Shadow Prices

- Source system: ERCOT Public Reports API.
- Source product: `NP6-86-CD`, SCED Shadow Prices and Binding Transmission
  Constraints.
- Report Type ID: `12302`.
- Endpoint: `np6-86-cd/shdw_prices_bnd_trns_const`.
- Runtime: `backend.scrapes.power.ercot.sced_shadow_prices`.
- Batch orchestration: `backend.orchestration.power.ercot.congestion_batch`.
- Destination: `ercot.sced_shadow_prices`.
- Primary grain: SCED timestamp x constraint id x constraint name x
  contingency name.
- Primary key: `scedtimestamp`, `constraintid`, `constraintname`,
  `contingencyname`.
- Safe rerun story: upsert on the primary key.
- dbt folder:
  `dbt/azure_postgres/models/power/ercot/sced_shadow_prices/`.
- Operator SQL:
  `dbt/azure_postgres/models/power/ercot/sced_shadow_prices/table_ercot_sced_shadow_prices.sql`
  and
  `dbt/azure_postgres/models/power/ercot/sced_shadow_prices/index_ercot_sced_shadow_prices.sql`.
- Production schedule: through `helios-ercot-congestion-batch.timer`, daily at
  `12:45 UTC` with `Persistent=true` and `RandomizedDelaySec=10min`; the
  scheduled default pulls the prior complete SCED day.
