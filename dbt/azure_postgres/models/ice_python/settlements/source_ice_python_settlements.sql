WITH source AS (
    SELECT
        trade_date,
        symbol,
        settlement,
        open,
        high,
        low,
        close,
        vwap_close,
        volume,
        created_at,
        updated_at
    FROM ice_python.settlements
)

SELECT *
FROM source
