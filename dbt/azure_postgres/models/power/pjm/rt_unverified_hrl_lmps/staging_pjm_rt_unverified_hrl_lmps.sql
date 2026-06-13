{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Real-Time Unverified Hourly LMPs.
-- Grain: 1 row per hourly interval x pricing node.
---------------------------

SELECT
    date
    ,hour_ending
    ,interval_beginning_ept
    ,interval_beginning_utc
    ,interval_ending_ept
    ,interval_ending_utc
    ,pricing_node
    ,pnode_type
    ,rt_lmp_total
    ,rt_lmp_system_energy_price
    ,rt_lmp_congestion_price
    ,rt_lmp_marginal_loss_price
FROM {{ ref('source_pjm_rt_unverified_hrl_lmps') }}
