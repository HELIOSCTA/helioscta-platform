WITH source AS (
    SELECT *
    FROM {{ ref('source_ice_python_settlement_contract_dates') }}
)

SELECT
    trade_date,
    symbol,
    strip,
    start_date,
    end_date,
    created_at,
    updated_at
FROM source
WHERE symbol IS NOT NULL
  AND trade_date IS NOT NULL
