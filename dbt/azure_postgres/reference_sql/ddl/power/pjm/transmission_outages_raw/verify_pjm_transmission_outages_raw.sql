-- Read-only verification for pjm.transmission_outages_raw.
--
-- Run with helios_readonly or helios_admin after the scrape writes. This checks
-- table shape, latest source capture, duplicate row numbers within a source
-- file, parsed-record shape, and hot-table retention state.

WITH latest_file AS (
    SELECT source_file_sha256
    FROM pjm.transmission_outages_raw
    ORDER BY source_report_timestamp DESC, ingested_at DESC
    LIMIT 1
),

latest_rows AS (
    SELECT r.*
    FROM pjm.transmission_outages_raw r
    INNER JOIN latest_file f
        ON r.source_file_sha256 = f.source_file_sha256
),

duplicate_row_numbers AS (
    SELECT
        source_file_sha256,
        source_row_number,
        COUNT(*) AS duplicate_count
    FROM pjm.transmission_outages_raw
    GROUP BY source_file_sha256, source_row_number
    HAVING COUNT(*) > 1
),

retention_violations AS (
    SELECT COUNT(*) AS expired_rows
    FROM pjm.transmission_outages_raw
    WHERE ingested_at < NOW() - INTERVAL '7 days'
),

unparsed_rows AS (
    SELECT COUNT(*) AS unparsed_row_count
    FROM latest_rows
    WHERE source_columns ? 'RAW LINE'
       OR record_kind = 'legacy_unparsed'
       OR raw_line LIKE '+-----+%'
       OR raw_line ILIKE 'ITEM   TICKET%'
),

section_counts AS (
    SELECT jsonb_object_agg(source_section, row_count ORDER BY source_section) AS counts
    FROM (
        SELECT source_section, COUNT(*) AS row_count
        FROM latest_rows
        GROUP BY source_section
    ) grouped
)

SELECT
    (SELECT COUNT(*) FROM latest_rows) AS latest_file_rows,
    (SELECT MIN(source_report_timestamp) FROM latest_rows) AS latest_report_timestamp,
    (SELECT MAX(ingested_at) FROM latest_rows) AS latest_ingested_at,
    (SELECT COUNT(*) FROM duplicate_row_numbers) AS duplicate_row_number_keys,
    (SELECT unparsed_row_count FROM unparsed_rows) AS unparsed_rows,
    COUNT(*) FILTER (WHERE ticket_id IS NOT NULL) AS rows_with_ticket_id,
    COUNT(*) FILTER (WHERE facility_name IS NOT NULL) AS rows_with_facility_name,
    COUNT(*) FILTER (WHERE source_section = 'SCHEDULED OUTAGES') AS scheduled_rows,
    COUNT(*) FILTER (WHERE start_datetime IS NOT NULL) AS rows_with_start_datetime,
    COUNT(*) FILTER (WHERE equipment_count > 1) AS rows_with_multiple_equipment,
    (SELECT counts FROM section_counts) AS section_counts,
    (SELECT expired_rows FROM retention_violations) AS expired_rows_after_retention
FROM latest_rows;
