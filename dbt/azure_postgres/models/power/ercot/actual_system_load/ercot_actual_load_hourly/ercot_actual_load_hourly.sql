SELECT *
FROM {{ ref('staging_ercot_actual_load_hourly') }}
