# MISO Data Exchange LMPs

## Source Contract

- Source system: MISO Data Exchange Pricing API.
- Credential boundary: backend-only `MISO_DATA_EXCHANGE_SUBSCRIPTION_KEY` sent
  as `Ocp-Apim-Subscription-Key`.
- DA endpoint: `/pricing/v1/day-ahead/{operating_date}/lmp-expost`.
- RT endpoint: `/pricing/v1/real-time/{operating_date}/lmp-expost`.
- Default hub set: `INDIANA.HUB`, `ARKANSAS.HUB`, `ILLINOIS.HUB`,
  `LOUISIANA.HUB`, `MICHIGAN.HUB`, `MINN.HUB`, and `TEXAS.HUB`.
- DA interface extension: MISO source node `PJMC` for the PJM interface.
- Primary grain: `operating_date x operating_hour x node_id x market_run_id`.
- Upsert key: `interval_start_time_utc, node_id, market_run_id`.

## Destination Tables

- `miso.da_lmps`: day-ahead ex-post hourly LMPs.
- `miso.rt_lmps_prelim`: preliminary real-time ex-post hourly LMPs.
- `miso.rt_lmps_final`: final real-time ex-post hourly LMPs.

Each table stores total LMP plus `mec` energy, `mcc` congestion, and `mlc` loss
components as `locational_marginal_price`, `energy_component`,
`congestion_component`, and `loss_component`.

## Runtime

- DA: `helios-miso-da-lmps.timer`, daily `19:00 UTC`, next operating date.
- RT preliminary: `helios-miso-rt-lmps-prelim.timer`, daily `09:15 UTC`,
  `13:15 UTC`, and `17:15 UTC`, previous operating date.
- RT final: `helios-miso-rt-lmps-final.timer`, daily `13:00 UTC`, operating
  date seven calendar days back.

Scheduled runs poll for complete hub/date coverage, upsert idempotently, write
poll telemetry to `ops.api_fetch_log`, and emit complete-day readiness events
to `ops.data_availability_events`. The DA workflow also queues the shared
inline DA LMP release email after complete-day readiness for the configured
backend recipient audience.
