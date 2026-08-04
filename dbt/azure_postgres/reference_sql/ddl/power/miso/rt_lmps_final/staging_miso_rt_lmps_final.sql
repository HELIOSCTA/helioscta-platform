WITH source AS (
    SELECT *
    FROM {{ ref('source_miso_rt_lmps_final') }}
),

final AS (
    SELECT
        interval_start_time_utc,
        interval_end_time_utc,
        operating_date,
        operating_hour,
        operating_interval,
        node_id,
        node,
        market_run_id,
        price_status,
        time_resolution,
        locational_marginal_price,
        energy_component,
        congestion_component,
        loss_component,
        source_endpoint,
        source_version,
        updated_at
    FROM source
    WHERE locational_marginal_price IS NOT NULL
)

SELECT *
FROM final
