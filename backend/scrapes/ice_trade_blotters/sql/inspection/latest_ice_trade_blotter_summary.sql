-- Read-only summary for the latest loaded ICE trade blotter file.
--
-- Source system: manually downloaded ICE Deal Report .xls/CSV exports.
-- Grain inspected: latest loaded file_hash from ice_trade_blotter.file_manifest.
-- Downstream use: freshness, row-count, and source-section review before
-- comparing ICE rows to NAV positions or Clear Street trades.

WITH latest_loaded_file AS (
    SELECT
        file_hash,
        source_filename,
        stored_filename,
        min_trade_date,
        max_trade_date,
        row_count,
        managed_at,
        loaded_at,
        loaded_row_count
    FROM ice_trade_blotter.file_manifest
    WHERE status = 'managed'
      AND is_loaded
    ORDER BY max_trade_date DESC, row_count DESC, managed_at DESC
    LIMIT 1
),
latest_trades AS (
    SELECT trades.*
    FROM ice_trade_blotter.ice_trade_blotter AS trades
    INNER JOIN latest_loaded_file
        ON latest_loaded_file.file_hash = trades.file_hash
),
section_counts AS (
    SELECT
        deal_section,
        COUNT(*) AS row_count,
        MIN(trade_date) AS min_trade_date,
        MAX(trade_date) AS max_trade_date,
        COUNT(DISTINCT deal_id) AS deal_count,
        COUNT(DISTINCT product) AS product_count,
        COUNT(DISTINCT hub) AS hub_count,
        SUM(total_quantity) AS total_quantity,
        SUM(lots) AS lots
    FROM latest_trades
    GROUP BY deal_section
),
FINAL AS (
    SELECT
        latest_loaded_file.file_hash,
        latest_loaded_file.source_filename,
        latest_loaded_file.stored_filename,
        latest_loaded_file.min_trade_date AS manifest_min_trade_date,
        latest_loaded_file.max_trade_date AS manifest_max_trade_date,
        latest_loaded_file.row_count AS manifest_row_count,
        latest_loaded_file.loaded_row_count,
        latest_loaded_file.managed_at,
        latest_loaded_file.loaded_at,
        section_counts.deal_section,
        section_counts.row_count,
        section_counts.min_trade_date,
        section_counts.max_trade_date,
        section_counts.deal_count,
        section_counts.product_count,
        section_counts.hub_count,
        section_counts.total_quantity,
        section_counts.lots
    FROM latest_loaded_file
    LEFT JOIN section_counts
        ON TRUE
)
SELECT *
FROM FINAL
ORDER BY deal_section;
