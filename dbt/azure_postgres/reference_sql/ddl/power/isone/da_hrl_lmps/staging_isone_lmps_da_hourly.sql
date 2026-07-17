{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ISO-NE day-ahead hourly LMPs.
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
    ,locational_marginal_price AS da_lmp_total
    ,energy_component AS da_lmp_energy_component
    ,congestion_component AS da_lmp_congestion_component
    ,marginal_loss_component AS da_lmp_marginal_loss_component
FROM {{ ref('source_isone_da_hrl_lmps') }}
