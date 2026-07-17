{{
  config(
    materialized='ephemeral'
  )
}}

----------------------------------
-- PJM verified five-minute RT LMPs.
-- Grain: 1 row per five-minute interval x pricing node.
----------------------------------

SELECT
    date
    ,interval_beginning_ept
    ,interval_beginning_utc
    ,interval_ending_ept
    ,interval_ending_utc
    ,pnode_id
    ,pricing_node
    ,pnode_type
    ,row_is_current
    ,version_nbr
    ,rt_lmp_total
    ,rt_lmp_system_energy_price
    ,rt_lmp_congestion_price
    ,rt_lmp_marginal_loss_price
FROM {{ ref('source_pjm_rt_fivemin_hrl_lmps') }}
