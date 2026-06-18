WITH source AS (
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
    FROM meteologica.pjm_forecast_hourly
)

SELECT *
FROM source

