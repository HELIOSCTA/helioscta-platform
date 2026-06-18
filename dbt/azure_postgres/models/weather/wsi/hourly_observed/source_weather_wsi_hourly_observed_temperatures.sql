{{
  config(
    materialized='ephemeral'
  )
}}

SELECT
    station_id,
    station_name,
    region,
    observation_date,
    hour_beginning,
    observation_time_local,
    temp_f,
    dew_point_f,
    feels_like_f,
    wind_chill_f,
    heat_index_f,
    wind_speed_mph,
    wind_dir_degrees,
    relative_humidity_pct,
    cloud_cover_pct,
    precip_in,
    source_product_id,
    source_updated_at,
    created_at,
    updated_at
FROM weather.wsi_hourly_observed_temperatures
