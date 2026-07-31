# PJM RTO Load Forecast Hourly Inputs

Read-only dbt input models for PJM RTO load forecast features used by the
temporary like-day KNN Sunny model family.

## Source Contract

- Source system: PJM load forecast feeds in `helios_prod.pjm`.
- Source tables:
  - `pjm.load_frcstd_7_day`
- Note: `helios_prod` currently exposes `pjm.load_frcstd_7_day` only; the
  historical lead-day pool input uses historical evaluated snapshots from that
  same table rather than a separate `pjm.load_frcstd_hist` relation.
- Historical grain: `date x hour_ending x region` after selecting the
  lead-day forecast issue available by the old day-ahead cutoff.
- Latest forecast grain: `date x hour_ending x region` after selecting the
  latest issue available by the runtime cutoff.
- Default region: `RTO`.
- Downstream consumer: temporary PJM like-day modelling loaders.

These models are ephemeral and do not create database objects.
