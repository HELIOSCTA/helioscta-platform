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
- Deployment status: runtime, orchestration, and systemd schedule
  are promoted for VM deployment.
- Production schedule: daily at `11:15 America/Chicago` with
  `Persistent=true` and
  `RandomizedDelaySec=5min`; the scheduled default pulls the next delivery
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
- Deployment status: runtime, orchestration, and systemd schedule
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
- Production schedule: through `helios-ercot-load-batch.timer`, daily at
  `07:20 America/Chicago` with `Persistent=true` and
  `RandomizedDelaySec=10min`; the scheduled default pulls complete operating
  days through yesterday.
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
- Production schedule: through `helios-ercot-load-batch.timer`, daily at
  `07:20 America/Chicago` with `Persistent=true` and
  `RandomizedDelaySec=10min`.
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
- Production schedule: through `helios-ercot-congestion-batch.timer`, daily at
  `07:45 America/Chicago` with `Persistent=true` and
  `RandomizedDelaySec=10min`; the scheduled default pulls the prior complete
  delivery date.
- Manual smoke: VM service ran the congestion batch for delivery date
  `2026-06-12` on `2026-06-13 18:06 UTC` and upserted 1,128 DAM shadow price
  rows.

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
- Production schedule: through `helios-ercot-congestion-batch.timer`, daily at
  `07:45 America/Chicago` with `Persistent=true` and
  `RandomizedDelaySec=10min`; the scheduled default pulls the prior complete
  SCED day.
- Manual smoke: VM service ran the congestion batch for SCED day `2026-06-12`
  on `2026-06-13 18:06 UTC` and upserted 2,618 SCED shadow price rows.

## Real-Time Price Adders By SCED Interval

- Source system: ERCOT Public Reports API.
- Source product: `NP6-323-CD`, Real-Time Price Adders by SCED Interval.
- Report Type ID: `13221`.
- Endpoint: `np6-323-cd/rt_price_adder_sced`.
- Runtime: `backend.scrapes.power.ercot.rt_price_adders_sced`.
- Batch orchestration: `backend.orchestration.power.ercot.price_adders_batch`.
- Destination: `ercot.rt_price_adders_sced`.
- Primary grain: SCED timestamp x repeat-hour flag.
- Primary key: `scedtimestamp`, `repeathourflag`.
- Safe rerun story: upsert on the primary key.
- Source cadence: event per SCED run. ERCOT public-report samples on
  `2026-07-17` exposed `SCEDTimestampFrom` and `SCEDTimestampTo` filters and
  current-day rows.
- Production schedule: through `helios-ercot-price-adders-batch.timer`, daily
  at `01:20 America/Chicago` with `Persistent=true`,
  `RandomizedDelaySec=10min`, and `AccuracySec=1min`; the scheduled default
  pulls the prior complete `America/Chicago` market date.
- Deployment note: production source table and indexes were applied on
  `2026-07-17`; run a VM smoke before enabling the timer.

## Real-Time Price Adders For 15-Minute Settlement Interval

- Source system: ERCOT Public Reports API.
- Source product: `NP6-324-CD`, Real-Time Price Adders for 15-Minute Settlement
  Interval.
- Report Type ID: `13220`.
- Endpoint: `np6-324-cd/rt_15min_price_adders`.
- Runtime: `backend.scrapes.power.ercot.rt_price_adders_15min`.
- Batch orchestration: `backend.orchestration.power.ercot.price_adders_batch`.
- Destination: `ercot.rt_price_adders_15min`.
- Primary grain: delivery date x delivery hour x delivery interval x
  repeat-hour flag.
- Primary key: `deliverydate`, `deliveryhour`, `deliveryinterval`,
  `repeathourflag`.
- Safe rerun story: upsert on the primary key.
- Source cadence: chron - 15 minutes. ERCOT public-report samples on
  `2026-07-17` exposed `deliveryDateFrom` and `deliveryDateTo` filters and
  current-day rows.
- Production schedule: through `helios-ercot-price-adders-batch.timer`, daily
  at `01:20 America/Chicago` with `Persistent=true`,
  `RandomizedDelaySec=10min`, and `AccuracySec=1min`; the scheduled default
  pulls the prior complete `America/Chicago` market date.
- Deployment note: production source table and indexes were applied on
  `2026-07-17`; run a VM smoke before enabling the timer.

## Wind Power Production Hourly

- Source system: ERCOT Public Reports API.
- Source product: `NP4-732-CD`, Wind Power Production - Hourly Averaged Actual
  and Forecasted Values.
- Report Type ID: `13028`.
- Endpoint: `np4-732-cd/wpp_hrly_avrg_actl_fcast`.
- Runtime: `backend.scrapes.power.ercot.wind_power_production_hourly`.
- Batch orchestration: `backend.orchestration.power.ercot.renewables_batch`.
- Destination: `ercot.wind_power_production_hourly`.
- Primary grain: posted datetime x delivery date x hour ending.
- Primary key: `posteddatetime`, `deliverydate`, `hourending`.
- Safe rerun story: upsert on the primary key.
- Production schedule: through `helios-ercot-renewables-batch.timer`, daily at
  `08:10 America/Chicago` with `Persistent=true` and
  `RandomizedDelaySec=10min`; the scheduled default pulls yesterday through
  seven days forward.
- Data shape note: the raw ERCOT payload contains actual wind generation,
  COP HSL, STWPF, WGRPP, and HSL fields. Downstream shaping unpivots system-wide and
  load-zone values into hourly region rows.
- Manual smoke: VM service ran the renewables batch for delivery dates
  `2026-06-12` through `2026-06-20` on `2026-06-13 18:32 UTC` and upserted
  20,910 wind rows.

## Solar Power Production Hourly

- Source system: ERCOT Public Reports API.
- Source product: `NP4-737-CD`, Solar Power Production - Hourly Averaged Actual
  and Forecasted Values.
- Report Type ID: `13483`.
- Endpoint: `np4-737-cd/spp_hrly_avrg_actl_fcast`.
- Runtime: `backend.scrapes.power.ercot.solar_power_production_hourly`.
- Batch orchestration: `backend.orchestration.power.ercot.renewables_batch`.
- Destination: `ercot.solar_power_production_hourly`.
- Primary grain: posted datetime x delivery date x hour ending.
- Primary key: `posteddatetime`, `deliverydate`, `hourending`.
- Safe rerun story: upsert on the primary key.
- Production schedule: through `helios-ercot-renewables-batch.timer`, daily at
  `08:10 America/Chicago` with `Persistent=true` and
  `RandomizedDelaySec=10min`; the scheduled default pulls yesterday through
  seven days forward.
- Data shape note: the raw ERCOT payload contains actual solar generation,
  COP HSL, STPPF, PVGRPP, and HSL fields. Downstream shaping exposes a system-wide
  hourly actual/forecast row.
- Manual smoke: VM service ran the renewables batch for delivery dates
  `2026-06-12` through `2026-06-20` on `2026-06-13 18:32 UTC` and upserted
  20,910 solar rows.

## Wind Power Actual 5-Minute

- Source system: ERCOT Public Reports API.
- Source product: `NP4-733-CD`, Wind Power Production - Actual 5-Minute
  Averaged Values.
- Report Type ID: `13071`.
- Endpoint: `np4-733-cd/wpp_actual_5min_avg_values`.
- Runtime: `backend.scrapes.power.ercot.wind_power_actual_5min`.
- Batch orchestration: `backend.orchestration.power.ercot.renewables_5min_batch`.
- Destination: `ercot.wind_power_actual_5min`.
- Primary grain: posted datetime x interval ending.
- Primary key: `posteddatetime`, `intervalending`.
- Safe rerun story: upsert on the primary key.
- Production schedule: through `helios-ercot-renewables-5min-batch.timer`,
  daily at `08:25 America/Chicago` with `Persistent=true` and
  `RandomizedDelaySec=10min`; the scheduled default pulls the prior complete
  interval-ending day.
- Data shape note: the raw ERCOT payload contains repeated posted snapshots
  for each 5-minute interval. Downstream shaping unpivots system-wide and load-zone
  actual generation into 5-minute region rows.

## Solar Power Actual 5-Minute

- Source system: ERCOT Public Reports API.
- Source product: `NP4-738-CD`, Solar Power Production - Actual 5-Minute
  Averaged Values.
- Report Type ID: `13484`.
- Endpoint: `np4-738-cd/spp_actual_5min_avg_values`.
- Runtime: `backend.scrapes.power.ercot.solar_power_actual_5min`.
- Batch orchestration: `backend.orchestration.power.ercot.renewables_5min_batch`.
- Destination: `ercot.solar_power_actual_5min`.
- Primary grain: posted datetime x interval ending.
- Primary key: `posteddatetime`, `intervalending`.
- Safe rerun story: upsert on the primary key.
- Production schedule: through `helios-ercot-renewables-5min-batch.timer`,
  daily at `08:25 America/Chicago` with `Persistent=true` and
  `RandomizedDelaySec=10min`; the scheduled default pulls the prior complete
  interval-ending day.
- Data shape note: the raw ERCOT payload contains repeated posted snapshots
  for each 5-minute interval. Downstream shaping exposes a system-wide actual
  generation row.

## Hourly Resource Outage Capacity

- Source system: ERCOT Public Reports API.
- Source product: `NP3-233-CD`, Hourly Resource Outage Capacity.
- Endpoint: `np3-233-cd/hourly_res_outage_cap`.
- Runtime: `backend.scrapes.power.ercot.hourly_resource_outage_capacity`.
- Batch orchestration: `backend.orchestration.power.ercot.outage_capacity_batch`.
- Destination: `ercot.hourly_resource_outage_capacity`.
- Primary grain: posted datetime x operating date x hour ending.
- Primary key: `posteddatetime`, `operatingdate`, `hourending`.
- Safe rerun story: upsert on the primary key.
- Production schedule: through `helios-ercot-outage-capacity-batch.timer`,
  daily at `08:35 America/Chicago` with `Persistent=true` and
  `RandomizedDelaySec=10min`; the scheduled default pulls the prior complete
  operating day.
- Data shape note: the raw ERCOT payload contains outage capacity by load zone
  for total resources, IRR resources, and new equipment. Downstream shaping unpivots
  those fields into hourly type x load-zone rows.
- Manual smoke: VM service ran the outage/capacity batch for operating date
  `2026-06-12` on `2026-06-13 18:49 UTC` and upserted 4,598 rows.

## Short-Term System Adequacy

- Source system: ERCOT Public Reports API.
- Source product: `NP3-763-CD`, Short-Term System Adequacy Report.
- Report Type ID: `12315`.
- Endpoint: `np3-763-cd/st_sys_adequacy`.
- Runtime: `backend.scrapes.power.ercot.short_term_system_adequacy`.
- Batch orchestration: `backend.orchestration.power.ercot.outage_capacity_batch`.
- Destination: `ercot.short_term_system_adequacy`.
- Primary grain: posted datetime x delivery date x hour ending x repeated hour
  flag.
- Primary key: `posteddatetime`, `deliverydate`, `hourending`,
  `repeathourflag`.
- Safe rerun story: upsert on the primary key.
- Production schedule: through `helios-ercot-outage-capacity-batch.timer`,
  daily at `08:35 America/Chicago` with `Persistent=true` and
  `RandomizedDelaySec=10min`; the scheduled default pulls the prior complete
  delivery date.
- Data shape note: the raw ERCOT payload contains available online generation
  resource capacity, load resource capacity, offline available MW by load zone,
  system-wide available capacity, and ancillary-service capability rollups.
