{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ISO-NE hourly actual system demand.
-- Grain: operating date x hour ending.
---------------------------

SELECT
    date
    ,hour_ending
    ,(
        date::timestamp
        + ((hour_ending - 1) * INTERVAL '1 hour')
    ) AS datetime_beginning_local
    ,(
        date::timestamp
        + (hour_ending * INTERVAL '1 hour')
    ) AS datetime_ending_local
    ,total_load
FROM {{ ref('source_isone_hourly_system_demand') }}
