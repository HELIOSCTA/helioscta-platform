{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ISO-NE final real-time hourly LMPs.
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
    ,location_id
    ,location_name
    ,location_type
    ,locational_marginal_price AS rt_lmp_total
    ,energy_component AS rt_lmp_energy_component
    ,congestion_component AS rt_lmp_congestion_component
    ,marginal_loss_component AS rt_lmp_marginal_loss_component
FROM {{ ref('source_isone_rt_hrl_lmps_final') }}
