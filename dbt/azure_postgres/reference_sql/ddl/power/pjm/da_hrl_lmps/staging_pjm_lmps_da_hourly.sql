{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM DA hourly LMPs.
-- Grain: 1 row per date x hour x hub.
---------------------------

SELECT
    date
    ,hour_ending
    ,hub
    ,da_lmp_total
    ,da_lmp_system_energy_price
    ,da_lmp_congestion_price
    ,da_lmp_marginal_loss_price
FROM {{ ref('source_pjm_da_hrl_lmps') }}
