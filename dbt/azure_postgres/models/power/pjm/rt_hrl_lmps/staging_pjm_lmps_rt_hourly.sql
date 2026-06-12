{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM RT hourly LMPs.
-- Grain: 1 row per date x hour x hub.
---------------------------

SELECT
    date
    ,hour_ending
    ,hub
    ,rt_lmp_total
    ,rt_lmp_system_energy_price
    ,rt_lmp_congestion_price
    ,rt_lmp_marginal_loss_price
FROM {{ ref('source_pjm_rt_hrl_lmps') }}
