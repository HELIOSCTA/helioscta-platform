-- administration.error_log
SELECT
    error_log_id
    ,error_date
    ,database_name
    ,error_number
    ,error_severity
    ,error_state
    ,error_procedure
    ,error_line
    ,error_message
FROM administration.error_log
WHERE 
    -- CAST(error_date AS DATE) >= '2025-10-07'
    CAST(error_date AS DATE) >= DATEADD(DAY, 0, CAST(GETUTCDATE() AT TIME ZONE 'UTC' AT TIME ZONE 'Mountain Standard Time' AS DATE))
ORDER BY error_date desc


-- natgas.load_status
SELECT TOP 10000
    load_id
    ,source_id
    ,name_full
    ,processed
    ,file_date AT TIME ZONE 'UTC' AT TIME ZONE 'Mountain Standard Time' AS file_date_mst
    ,insert_date AT TIME ZONE 'UTC' AT TIME ZONE 'Mountain Standard Time' AS insert_date_mst
    ,insert_by
    ,update_date AT TIME ZONE 'UTC' AT TIME ZONE 'Mountain Standard Time' AS update_date_mst
    ,update_by
    ,row_count
FROM natgas.load_status
WHERE 

    -- CAST(update_date AS DATE) >= '2025-10-03'
    CAST(update_date AS DATE) = DATEADD(DAY, 1, CAST(GETUTCDATE() AT TIME ZONE 'UTC' AT TIME ZONE 'Mountain Standard Time' AS DATE))

    AND source_id in (1) -- metadata
    -- AND source_id in (17, 18, 19, 20, 21, 22) -- delta
    -- AND source_id in (22, 32) -- hourly
    -- AND source_id in (33) -- gas_production_forecast & daily_pipe_production

    -- TODO: dead ...
    -- AND source_id in (7, 8, 9, 10, 11) -- daily
    -- AND source_id in (12, 13, 14, 15, 16) -- bidaily

    -- AND name_full like '%gas_burn%'
    -- AND name_full like '%nominations%'
    -- AND name_full like '%pipeline_inventory%'

ORDER BY update_date desc