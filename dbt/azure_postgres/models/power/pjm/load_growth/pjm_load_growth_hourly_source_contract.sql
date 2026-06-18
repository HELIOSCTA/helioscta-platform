{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM load-growth source contract check.
-- Source systems:
--   - PJM Data Miner 2 pjm.hrl_load_prelim, grain datetime_beginning_utc x load_area.
--   - PJM Data Miner 2 pjm.hrl_load_metered, grain datetime_beginning_utc x nerc_region x mkt_region x zone x load_area x is_verified.
--   - WSI Trader weather.wsi_hourly_observed_temperatures, grain station_id x observation_time_local x region.
-- Initial frontend join:
--   pjm.hrl_load_prelim.datetime_beginning_ept = weather.wsi_hourly_observed_temperatures.observation_time_local
--   and WSI station_id = 'PJM', region = 'PJM'.
-- This model is read-only query shaping and should not be materialized into production.
---------------------------

WITH prelim_load AS (
    SELECT
        datetime_beginning_ept
        ,datetime_beginning_utc
        ,load_area
        ,prelim_load_avg_hourly
    FROM {{ ref('pjm_hrl_load_prelim') }}
),

metered_load_hourly AS (
    SELECT
        datetime_beginning_ept
        ,load_area
        ,COUNT(*) AS metered_row_count
        ,SUM(mw) AS metered_load_mw
    FROM {{ ref('pjm_hrl_load_metered') }}
    WHERE is_verified
    GROUP BY
        datetime_beginning_ept
        ,load_area
),

wsi_pjm_hourly AS (
    SELECT
        observation_time_local
        ,station_id
        ,region
        ,temp_f
        ,dew_point_f
        ,feels_like_f
        ,relative_humidity_pct
        ,cloud_cover_pct
        ,precip_in
    FROM {{ ref('weather_wsi_hourly_observed_temperatures') }}
    WHERE
        station_id = 'PJM'
        AND region = 'PJM'
)

SELECT
    prelim_load.datetime_beginning_ept
    ,prelim_load.datetime_beginning_utc
    ,prelim_load.load_area
    ,prelim_load.prelim_load_avg_hourly
    ,metered_load_hourly.metered_load_mw
    ,metered_load_hourly.metered_row_count
    ,wsi_pjm_hourly.station_id AS wsi_station_id
    ,wsi_pjm_hourly.region AS wsi_region
    ,wsi_pjm_hourly.temp_f
    ,wsi_pjm_hourly.dew_point_f
    ,wsi_pjm_hourly.feels_like_f
    ,wsi_pjm_hourly.relative_humidity_pct
    ,wsi_pjm_hourly.cloud_cover_pct
    ,wsi_pjm_hourly.precip_in
    ,CASE
        WHEN wsi_pjm_hourly.observation_time_local IS NULL THEN FALSE
        ELSE TRUE
    END AS has_wsi_pjm_observation
FROM prelim_load
LEFT JOIN metered_load_hourly
    ON prelim_load.datetime_beginning_ept = metered_load_hourly.datetime_beginning_ept
    AND prelim_load.load_area = metered_load_hourly.load_area
LEFT JOIN wsi_pjm_hourly
    ON prelim_load.datetime_beginning_ept = wsi_pjm_hourly.observation_time_local
