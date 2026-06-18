WITH source AS (
    SELECT
        trade_date,
        symbol,
        strip,
        start_date,
        end_date,
        created_at,
        updated_at
    FROM ice_python.settlement_contract_dates
)

SELECT *
FROM source
