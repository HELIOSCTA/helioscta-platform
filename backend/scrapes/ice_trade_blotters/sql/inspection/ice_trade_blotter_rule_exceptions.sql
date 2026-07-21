-- Read-only source-quality exceptions for ICE trade blotter rows.
--
-- Source system: manually downloaded ICE Deal Report .xls/CSV exports.
-- Grain inspected: one exception per raw ICE deal-leg row and exception type.
-- Use before comparing ICE rows to NAV positions or Clear Street trades.

WITH source_rows AS (
    SELECT
        trades.file_hash,
        manifest.source_filename,
        manifest.stored_filename,
        trades.source_row_number,
        trades.deal_id,
        trades.leg_id,
        trades.user_id,
        trades.trade_date,
        trades.b_s,
        trades.product,
        trades.hub,
        trades.contract,
        trades.begin_date,
        trades.end_date,
        trades.lots,
        trades.total_quantity,
        trades.price,
        trades.option,
        trades.strike,
        trades.strike_2,
        trades.source_row_hash
    FROM ice_trade_blotter.ice_trade_blotter AS trades
    LEFT JOIN ice_trade_blotter.file_manifest AS manifest
        ON manifest.file_hash = trades.file_hash
),
exceptions AS (
    SELECT *, 'missing_deal_id' AS exception_type
    FROM source_rows
    WHERE nullif(trim(deal_id), '') IS NULL

    UNION ALL

    SELECT *, 'missing_user_id' AS exception_type
    FROM source_rows
    WHERE nullif(trim(user_id), '') IS NULL

    UNION ALL

    SELECT *, 'missing_hub_or_contract' AS exception_type
    FROM source_rows
    WHERE nullif(trim(hub), '') IS NULL
       OR nullif(trim(contract), '') IS NULL

    UNION ALL

    SELECT *, 'unexpected_side' AS exception_type
    FROM source_rows
    WHERE upper(trim(b_s)) NOT IN ('B', 'S', 'BUY', 'SELL', 'BOUGHT', 'SOLD')

    UNION ALL

    SELECT *, 'zero_quantity_or_lots' AS exception_type
    FROM source_rows
    WHERE coalesce(total_quantity, 0) = 0
       OR coalesce(lots, 0) = 0

    UNION ALL

    SELECT *, 'missing_file_manifest' AS exception_type
    FROM source_rows
    WHERE stored_filename IS NULL
),
FINAL AS (
    SELECT
        exception_type,
        file_hash,
        source_filename,
        stored_filename,
        source_row_number,
        trade_date,
        deal_id,
        leg_id,
        user_id,
        b_s,
        product,
        hub,
        contract,
        begin_date,
        end_date,
        lots,
        total_quantity,
        price,
        option,
        strike,
        strike_2,
        source_row_hash
    FROM exceptions
)
SELECT *
FROM FINAL
ORDER BY trade_date DESC NULLS LAST, exception_type, source_filename, source_row_number;
