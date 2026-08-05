-- Read-only validation SQL for promoted NYISO MIS LBMP source tables.

WITH expected_nodes AS (
    SELECT *
    FROM (
        VALUES
            ('WEST', 61752),
            ('GENESE', 61753),
            ('CENTRL', 61754),
            ('NORTH', 61755),
            ('MHK VL', 61756),
            ('CAPITL', 61757),
            ('HUD VL', 61758),
            ('MILLWD', 61759),
            ('DUNWOD', 61760),
            ('N.Y.C.', 61761),
            ('LONGIL', 61762),
            ('PJM', 61847)
    ) AS nodes(node_id, ptid)
),

coverage AS (
    SELECT
        'nyiso.da_lmps' AS table_name,
        operating_date,
        node_id,
        ptid,
        COUNT(*) AS row_count,
        COUNT(DISTINCT operating_hour) AS hour_count,
        COUNT(DISTINCT interval_start_time_utc) AS interval_count,
        MAX(updated_at) AS latest_update_utc
    FROM nyiso.da_lmps
    GROUP BY operating_date, node_id, ptid

    UNION ALL

    SELECT
        'nyiso.rt_lmps_prelim' AS table_name,
        operating_date,
        node_id,
        ptid,
        COUNT(*) AS row_count,
        COUNT(DISTINCT operating_hour) AS hour_count,
        COUNT(DISTINCT interval_start_time_utc) AS interval_count,
        MAX(updated_at) AS latest_update_utc
    FROM nyiso.rt_lmps_prelim
    GROUP BY operating_date, node_id, ptid
),

latest_coverage AS (
    SELECT coverage.*
    FROM coverage
    INNER JOIN expected_nodes
        ON coverage.node_id = expected_nodes.node_id
        AND coverage.ptid = expected_nodes.ptid
    WHERE coverage.operating_date >= CURRENT_DATE - INTERVAL '14 days'
),

component_reconciliation AS (
    SELECT
        'nyiso.da_lmps' AS table_name,
        operating_date,
        node_id,
        ptid,
        MAX(ABS(
            locational_marginal_price
            - COALESCE(energy_component, 0)
            - COALESCE(congestion_component, 0)
            - COALESCE(loss_component, 0)
        )) AS max_component_delta
    FROM nyiso.da_lmps
    WHERE operating_date >= CURRENT_DATE - INTERVAL '14 days'
    GROUP BY operating_date, node_id, ptid

    UNION ALL

    SELECT
        'nyiso.rt_lmps_prelim' AS table_name,
        operating_date,
        node_id,
        ptid,
        MAX(ABS(
            locational_marginal_price
            - COALESCE(energy_component, 0)
            - COALESCE(congestion_component, 0)
            - COALESCE(loss_component, 0)
        )) AS max_component_delta
    FROM nyiso.rt_lmps_prelim
    WHERE operating_date >= CURRENT_DATE - INTERVAL '14 days'
    GROUP BY operating_date, node_id, ptid
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
    WHERE provider = 'nyiso'
      AND pipeline_name IN (
          'nyiso_da_lmps',
          'nyiso_rt_lmps_prelim'
      )
      AND created_at >= now() - INTERVAL '14 days'
),

readiness_events AS (
    SELECT
        dataset,
        event_key,
        business_date,
        row_count,
        entity_count,
        period_count,
        created_at
    FROM ops.data_availability_events
    WHERE source_system = 'nyiso'
      AND dataset IN (
          'nyiso_da_lmps',
          'nyiso_rt_lmps_prelim'
      )
      AND business_date >= CURRENT_DATE - INTERVAL '14 days'
),

FINAL AS (
    SELECT
        'coverage' AS check_name,
        table_name,
        operating_date,
        node_id,
        ptid,
        row_count,
        hour_count,
        interval_count,
        latest_update_utc,
        NULL::DOUBLE PRECISION AS max_component_delta,
        NULL::VARCHAR AS pipeline_name,
        NULL::VARCHAR AS fetch_status,
        NULL::VARCHAR AS event_key
    FROM latest_coverage

    UNION ALL

    SELECT
        'component_reconciliation' AS check_name,
        table_name,
        operating_date,
        node_id,
        ptid,
        NULL::BIGINT AS row_count,
        NULL::BIGINT AS hour_count,
        NULL::BIGINT AS interval_count,
        NULL::TIMESTAMPTZ AS latest_update_utc,
        max_component_delta,
        NULL::VARCHAR AS pipeline_name,
        NULL::VARCHAR AS fetch_status,
        NULL::VARCHAR AS event_key
    FROM component_reconciliation

    UNION ALL

    SELECT
        'fetch_telemetry' AS check_name,
        NULL::VARCHAR AS table_name,
        NULL::DATE AS operating_date,
        NULL::VARCHAR AS node_id,
        NULL::INTEGER AS ptid,
        rows_returned::BIGINT AS row_count,
        NULL::BIGINT AS hour_count,
        NULL::BIGINT AS interval_count,
        created_at AS latest_update_utc,
        NULL::DOUBLE PRECISION AS max_component_delta,
        pipeline_name,
        status AS fetch_status,
        NULL::VARCHAR AS event_key
    FROM latest_fetches

    UNION ALL

    SELECT
        'readiness_event' AS check_name,
        dataset AS table_name,
        business_date AS operating_date,
        NULL::VARCHAR AS node_id,
        NULL::INTEGER AS ptid,
        row_count::BIGINT,
        NULL::BIGINT AS hour_count,
        period_count::BIGINT AS interval_count,
        created_at AS latest_update_utc,
        NULL::DOUBLE PRECISION AS max_component_delta,
        NULL::VARCHAR AS pipeline_name,
        'complete' AS fetch_status,
        event_key
    FROM readiness_events
)

SELECT *
FROM FINAL
ORDER BY
    check_name,
    table_name,
    operating_date DESC NULLS LAST,
    node_id NULLS LAST,
    latest_update_utc DESC NULLS LAST;
