WITH source AS (
    SELECT *
    FROM {{ ref('source_ice_python_settlements') }}
)

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
    open_interest,
    created_at,
    updated_at
FROM source
WHERE symbol IS NOT NULL
  AND trade_date IS NOT NULL
