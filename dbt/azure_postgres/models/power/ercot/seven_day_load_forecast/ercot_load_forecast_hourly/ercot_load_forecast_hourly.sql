SELECT *
FROM {{ ref('staging_ercot_load_forecast_hourly') }}
