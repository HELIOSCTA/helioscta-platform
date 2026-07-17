WITH source AS (
    SELECT *
    FROM {{ ref('source_caiso_rt_lmps') }}
)

SELECT
    interval_start_time_utc,
    interval_end_time_utc,
    operating_date,
    operating_hour,
    operating_interval,
    node_id,
    node,
    market_run_id,
    locational_marginal_price,
    energy_component,
    congestion_component,
    loss_component,
    greenhouse_gas_component,
    source_query_name,
    source_version,
    updated_at
FROM source
WHERE locational_marginal_price IS NOT NULL
