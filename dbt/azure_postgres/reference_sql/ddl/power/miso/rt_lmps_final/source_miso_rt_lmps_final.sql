WITH source AS (
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
        created_at,
        updated_at
    FROM miso.rt_lmps_final
),

final AS (
    SELECT *
    FROM source
)

SELECT *
FROM final
