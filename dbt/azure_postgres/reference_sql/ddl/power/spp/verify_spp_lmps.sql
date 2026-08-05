-- Read-only validation SQL for promoted SPP Portal LMP source tables.

WITH expected_hubs AS (
    SELECT *
    FROM (
        VALUES
            ('SPPNORTH_HUB'),
            ('SPPSOUTH_HUB')
    ) AS hubs(node_id)
),

coverage AS (
    SELECT
        'spp.da_lmps' AS table_name,
        operating_date,
        node_id,
        COUNT(*) AS row_count,
        COUNT(DISTINCT operating_hour) AS hour_count,
        COUNT(DISTINCT interval_start_time_utc) AS interval_count,
        MAX(updated_at) AS latest_update_utc
    FROM spp.da_lmps
    GROUP BY operating_date, node_id

    UNION ALL

    SELECT
        'spp.rt_lmps_prelim' AS table_name,
        operating_date,
        node_id,
        COUNT(*) AS row_count,
        COUNT(DISTINCT operating_hour) AS hour_count,
        COUNT(DISTINCT interval_start_time_utc) AS interval_count,
        MAX(updated_at) AS latest_update_utc
    FROM spp.rt_lmps_prelim
    GROUP BY operating_date, node_id
),

latest_coverage AS (
    SELECT *
    FROM coverage
    WHERE operating_date >= CURRENT_DATE - INTERVAL '14 days'
),

component_reconciliation AS (
    SELECT
        'spp.da_lmps' AS table_name,
        operating_date,
        node_id,
        MAX(ABS(
            locational_marginal_price
            - COALESCE(energy_component, 0)
            - COALESCE(congestion_component, 0)
            - COALESCE(loss_component, 0)
        )) AS max_component_delta
    FROM spp.da_lmps
    WHERE operating_date >= CURRENT_DATE - INTERVAL '14 days'
    GROUP BY operating_date, node_id

    UNION ALL

    SELECT
        'spp.rt_lmps_prelim' AS table_name,
        operating_date,
        node_id,
        MAX(ABS(
            locational_marginal_price
            - COALESCE(energy_component, 0)
            - COALESCE(congestion_component, 0)
            - COALESCE(loss_component, 0)
        )) AS max_component_delta
    FROM spp.rt_lmps_prelim
    WHERE operating_date >= CURRENT_DATE - INTERVAL '14 days'
    GROUP BY operating_date, node_id
),

latest_fetches AS (
    SELECT
        pipeline_name,
        status,
        http_status,
        rows_returned,
        created_at,
        metadata
    FROM ops.api_fetch_log
    WHERE provider = 'spp'
      AND pipeline_name IN (
          'spp_da_lmps',
          'spp_rt_lmps_prelim'
      )
      AND created_at >= now() - INTERVAL '14 days'
),

FINAL AS (
    SELECT
        'coverage' AS check_name,
        table_name,
        operating_date,
        node_id,
        row_count,
        hour_count,
        interval_count,
        latest_update_utc,
        NULL::DOUBLE PRECISION AS max_component_delta,
        NULL::VARCHAR AS pipeline_name,
        NULL::VARCHAR AS fetch_status
    FROM latest_coverage
    WHERE node_id IN (SELECT node_id FROM expected_hubs)

    UNION ALL

    SELECT
        'component_reconciliation' AS check_name,
        table_name,
        operating_date,
        node_id,
        NULL::BIGINT AS row_count,
        NULL::BIGINT AS hour_count,
        NULL::BIGINT AS interval_count,
        NULL::TIMESTAMPTZ AS latest_update_utc,
        max_component_delta,
        NULL::VARCHAR AS pipeline_name,
        NULL::VARCHAR AS fetch_status
    FROM component_reconciliation

    UNION ALL

    SELECT
        'fetch_telemetry' AS check_name,
        NULL::VARCHAR AS table_name,
        NULL::DATE AS operating_date,
        NULL::VARCHAR AS node_id,
        rows_returned::BIGINT AS row_count,
        NULL::BIGINT AS hour_count,
        NULL::BIGINT AS interval_count,
        created_at AS latest_update_utc,
        NULL::DOUBLE PRECISION AS max_component_delta,
        pipeline_name,
        status AS fetch_status
    FROM latest_fetches
)

SELECT *
FROM FINAL
ORDER BY
    check_name,
    table_name,
    operating_date DESC NULLS LAST,
    node_id NULLS LAST,
    latest_update_utc DESC NULLS LAST;
