WITH source AS (
    SELECT *
    FROM {{ ref('source_meteologica_pjm_forecast_hourly') }}
)

SELECT
    content_id,
    content_name,
    update_id,
    issue_date,
    metric,
    region,
    forecast_area,
    forecast_period_start,
    forecast_period_end,
    forecast_period_start::date AS forecast_date,
    EXTRACT(hour FROM forecast_period_start)::int AS he_start,
    EXTRACT(hour FROM forecast_period_start)::int + 1 AS hour_ending,
    utc_offset_from,
    utc_offset_to,
    forecast_mw,
    perc10_mw,
    perc90_mw,
    arpege_run,
    ecmwf_ens_run,
    ecmwf_hres_run,
    gfs_run,
    nam_run,
    source_timezone,
    source_unit,
    scrape_run_at_utc,
    created_at,
    updated_at
FROM source
WHERE region = 'PJM'
  AND forecast_area IN ('RTO', 'MIDATL', 'SOUTH', 'WEST')
  AND metric IN ('load', 'solar', 'wind')
