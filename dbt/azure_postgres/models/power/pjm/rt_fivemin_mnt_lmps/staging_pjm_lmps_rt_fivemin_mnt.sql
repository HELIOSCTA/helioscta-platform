{{
  config(
    materialized='ephemeral'
  )
}}

----------------------------------
-- PJM settlements verified five-minute RT LMPs.
-- Grain: 1 row per five-minute interval x hub.
----------------------------------

SELECT
    date
    ,interval_beginning_ept
    ,interval_beginning_utc
    ,interval_ending_ept
    ,interval_ending_utc
    ,pnode_id
    ,hub
    ,pnode_type
    ,rt_lmp_total
    ,rt_lmp_system_energy_price
    ,rt_lmp_congestion_price
    ,rt_lmp_marginal_loss_price
FROM {{ ref('source_pjm_rt_fivemin_mnt_lmps') }}
