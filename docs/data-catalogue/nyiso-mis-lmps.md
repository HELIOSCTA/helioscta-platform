# NYISO MIS LBMPs

## Source Contract

- Source system: NYISO public MIS CSV.
- Credential boundary: public feed, no backend secret or API key.
- DA endpoint: `public/csv/damlbmp/YYYYMMDDdamlbmp_zone.csv`.
- RT endpoint: `public/csv/realtime/YYYYMMDDrealtime_zone.csv`.
- Default load-zone set: `WEST`, `GENESE`, `CENTRL`, `NORTH`, `MHK VL`,
  `CAPITL`, `HUD VL`, `MILLWD`, `DUNWOD`, `N.Y.C.`, and `LONGIL`.
- Primary grain: `operating_date x interval_start_time_utc x node_id/PTID x
  market_run_id`.
- Upsert key: `interval_start_time_utc, node_id, market_run_id`.

## Destination Tables

- `nyiso.da_lmps`: day-ahead hourly zonal LBMPs.
- `nyiso.rt_lmps_prelim`: preliminary real-time five-minute zonal LBMPs.

Each table stores total LBMP plus derived energy, congestion, and loss
components as `locational_marginal_price`, `energy_component`,
`congestion_component`, and `loss_component`. NYISO publishes loss and
congestion directly; energy is derived as total LBMP minus loss minus
congestion. The public PTID is retained in `ptid`.

## Runtime

- DA: `helios-nyiso-da-lmps.timer`, daily `09:00 America/New_York`, next
  operating date.
- RT preliminary: `helios-nyiso-rt-lmps-prelim.timer`, daily
  `00:15 America/New_York`, previous operating date.

Scheduled runs poll every five minutes for up to two hours, upsert
idempotently, write resolved poll telemetry to `ops.api_fetch_log`, and emit
complete-day readiness events to `ops.data_availability_events`. The DA
workflow also queues the shared inline DA LMP release email after complete-day
readiness for the configured backend recipient audience.
