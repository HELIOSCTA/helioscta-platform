-- Read-only verification SQL for Williams Transco gas EBB notices.
--
-- Manual VM smoke:
--   sudo systemctl start helios-gas-ebb-williams-transco.service
--   journalctl -u helios-gas-ebb-williams-transco.service -n 200 --no-pager
--
-- Telemetry should show provider='gas_ebb' and
-- pipeline_name='gas_ebb_williams_transco' rows for fetch_listing,
-- parse_listing, upsert_listing, detail_fetch, lifecycle, and retention.

SELECT
    COUNT(*) AS notice_count,
    COUNT(*) FILTER (WHERE is_current_on_ebb) AS current_notice_count,
    COUNT(*) FILTER (WHERE NOT is_current_on_ebb) AS stale_notice_count,
    MIN(posted_at_utc) AS min_posted_at_utc,
    MAX(posted_at_utc) AS max_posted_at_utc,
    MAX(last_seen_at_utc) AS max_last_seen_at_utc,
    COUNT(*) FILTER (WHERE latest_detail_content_hash IS NOT NULL) AS notices_with_detail
FROM gas_ebbs.notices
WHERE source_family = 'williams_1line'
  AND pipeline_key = 'williams_transco';

SELECT
    notice_stream,
    critical_ind,
    COUNT(*) AS notice_count,
    COUNT(*) FILTER (WHERE is_current_on_ebb) AS current_notice_count,
    MAX(posted_at_utc) AS max_posted_at_utc
FROM gas_ebbs.notices
WHERE source_family = 'williams_1line'
  AND pipeline_key = 'williams_transco'
GROUP BY notice_stream, critical_ind
ORDER BY notice_stream;

SELECT
    source_family,
    pipeline_key,
    source_notice_id,
    COUNT(*) AS row_count
FROM gas_ebbs.notices
GROUP BY source_family, pipeline_key, source_notice_id
HAVING COUNT(*) > 1
ORDER BY row_count DESC
LIMIT 50;

SELECT
    COUNT(*) AS revision_rows,
    COUNT(DISTINCT source_content_hash) AS distinct_content_hashes,
    MAX(revision_observed_at_utc) AS latest_revision_observed_at_utc
FROM gas_ebbs.notice_revisions
WHERE source_family = 'williams_1line'
  AND pipeline_key = 'williams_transco';

SELECT
    COUNT(*) AS detail_rows,
    MAX(detail_fetched_at_utc) AS latest_detail_fetched_at_utc,
    COUNT(*) FILTER (
        WHERE jsonb_array_length(supporting_data) > 0
    ) AS details_with_supporting_tables
FROM gas_ebbs.notice_details
WHERE source_family = 'williams_1line'
  AND pipeline_key = 'williams_transco';

SELECT
    COUNT(*) AS planned_outage_rows,
    MAX(derived_at_utc) AS latest_planned_outage_derived_at_utc,
    COUNT(DISTINCT location_id) AS location_count,
    COUNT(DISTINCT job_number) AS job_count
FROM gas_ebbs.planned_outages
WHERE source_family = 'williams_1line'
  AND pipeline_key = 'williams_transco';

SELECT
    'notice_details' AS table_name,
    COUNT(*) AS retention_violations
FROM gas_ebbs.notice_details d
JOIN gas_ebbs.notices n
  ON n.source_family = d.source_family
 AND n.pipeline_key = d.pipeline_key
 AND n.source_notice_id = d.source_notice_id
WHERE n.is_current_on_ebb = FALSE
  AND n.stale_at_utc < NOW() - INTERVAL '30 days'
UNION ALL
SELECT
    'notice_revisions' AS table_name,
    COUNT(*) AS retention_violations
FROM gas_ebbs.notice_revisions r
JOIN gas_ebbs.notices n
  ON n.source_family = r.source_family
 AND n.pipeline_key = r.pipeline_key
 AND n.source_notice_id = r.source_notice_id
WHERE n.is_current_on_ebb = FALSE
  AND r.revision_observed_at_utc < NOW() - INTERVAL '365 days'
UNION ALL
SELECT
    'planned_outages' AS table_name,
    COUNT(*) AS retention_violations
FROM gas_ebbs.planned_outages p
JOIN gas_ebbs.notices n
  ON n.source_family = p.source_family
 AND n.pipeline_key = p.pipeline_key
 AND n.source_notice_id = p.source_notice_id
WHERE n.is_current_on_ebb = FALSE
  AND p.derived_at_utc < NOW() - INTERVAL '365 days'
UNION ALL
SELECT
    'notices' AS table_name,
    COUNT(*) AS retention_violations
FROM gas_ebbs.notices n
WHERE n.is_current_on_ebb = FALSE
  AND n.stale_at_utc < NOW() - INTERVAL '365 days';

SELECT
    created_at,
    provider,
    pipeline_name,
    operation_name,
    feed_name,
    target_table,
    status,
    http_status,
    rows_returned,
    rows_written,
    error_type,
    metadata
FROM ops.api_fetch_log
WHERE provider = 'gas_ebb'
  AND pipeline_name = 'gas_ebb_williams_transco'
ORDER BY created_at DESC
LIMIT 50;
