{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ISO-NE preliminary real-time hourly LMPs.
-- Grain: operating date x hour ending x location.
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
    ,location
    ,lmp AS rt_lmp_total
    ,energy AS rt_lmp_energy_component
    ,congestion AS rt_lmp_congestion_component
    ,loss AS rt_lmp_loss_component
FROM {{ ref('source_isone_rt_hrl_lmps_prelim') }}
