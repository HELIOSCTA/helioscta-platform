WITH source AS (
    SELECT
        interval_start_time_utc,
        interval_end_time_utc,
        operating_date,
        operating_hour,
        operating_interval,
        node_id_xml,
        node_id,
        node,
        market_run_id,
        pnode_resmrid,
        grp_type,
        locational_marginal_price,
        energy_component,
        congestion_component,
        loss_component,
        greenhouse_gas_component,
        source_query_name,
        source_version,
        created_at,
        updated_at
    FROM caiso.rt_lmps
)

SELECT *
FROM source
