# Williams Transco Gas EBB Notices

## Source

Williams 1Line public EBB for Transco notices:

- Pipeline: Transco, `buid=80`.
- Listing pages: critical and non-critical `notice_list.jsf` with `archive=N`.
- Detail pages: `/1Line/wgp/download?delvid=<source_notice_id>`.
- Credentials: none.

The production runtime is
`backend.orchestration.gas_ebbs.williams_transco`, scheduled by
`helios-gas-ebb-williams-transco.timer` every 15 minutes when enabled.

## Tables

Reference DDL lives under
`dbt/azure_postgres/reference_sql/ddl/gas_ebbs/williams_transco/` and must be
applied manually with `helios_admin`.

- `gas_ebbs.notices`: one row per
  `source_family x pipeline_key x source_notice_id`. This is the current/stale
  lifecycle table and uses `last_seen_at_utc` as scrape freshness.
- `gas_ebbs.notice_revisions`: one row per source content hash for a notice,
  not one row per poll.
- `gas_ebbs.notice_details`: cleaned detail text, parsed metadata, and parsed
  supporting tables.
- `gas_ebbs.planned_outages`: conservative derived rows from detail tables when
  the source table shape includes location, available capacity, and job fields.

## Reliability

Critical and non-critical listing streams are fetched and parsed independently.
Listing fetch, parse, upsert, detail fetch, lifecycle, and retention stages log
to `ops.api_fetch_log` with `provider = 'gas_ebb'` and
`pipeline_name = 'gas_ebb_williams_transco'`.

Missing notices are marked stale only after both listing streams succeed in
the same run. Detail failures are logged and recorded on the notice row but do
not clear listing data. Parse failures count as failed runs, not zero-row
success.

## Retention

Runtime retention keeps non-current business history for 365 days and
bulky/supporting detail rows for 30 days after the source notice becomes
stale. Rows linked to source notices still current on the EBB are never purged
by the runtime retention step.
