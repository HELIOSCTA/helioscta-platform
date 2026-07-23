-- Read-only verification for pjm.transmission_outages_raw.
--
-- Run with helios_readonly or helios_admin after the scrape writes. This checks
-- raw TXT file shape, latest source capture, uniqueness, and hot-table
-- retention state.

WITH duplicate_files AS (
    SELECT
        source_file_sha256,
        COUNT(*) AS duplicate_count
    FROM pjm.transmission_outages_raw
    GROUP BY source_file_sha256
    HAVING COUNT(*) > 1
),

retention_violations AS (
    SELECT COUNT(*) AS expired_files
    FROM pjm.transmission_outages_raw
    WHERE ingested_at < NOW() - INTERVAL '7 days'
),

latest_file AS (
    SELECT *
    FROM pjm.transmission_outages_raw
    ORDER BY source_report_timestamp DESC, ingested_at DESC
    LIMIT 1
)

SELECT
    (SELECT COUNT(*) FROM pjm.transmission_outages_raw) AS source_files,
    (SELECT COUNT(*) FROM duplicate_files) AS duplicate_file_hashes,
    (SELECT source_report_timestamp FROM latest_file) AS latest_report_timestamp,
    (SELECT ingested_at FROM latest_file) AS latest_ingested_at,
    (SELECT source_file_sha256 FROM latest_file) AS latest_source_file_sha256,
    (SELECT source_line_count FROM latest_file) AS latest_source_line_count,
    (SELECT LENGTH(raw_text) FROM latest_file) AS latest_raw_text_chars,
    (SELECT expired_files FROM retention_violations) AS expired_files_after_retention;
