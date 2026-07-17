{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ISO-NE day-ahead hourly cleared demand.
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
    ,day_ahead_cleared_demand
FROM {{ ref('source_isone_da_hrl_cleared_demand') }}
