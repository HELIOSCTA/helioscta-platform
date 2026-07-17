{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM RT HRL LMPs normalized from PJM Data Miner.
-- Grain: 1 row per date x hour x hub.
---------------------------

SELECT
    datetime_beginning_ept::date AS date
    ,(EXTRACT(HOUR FROM datetime_beginning_ept) + 1)::int AS hour_ending

    ,pnode_name AS hub

    ,total_lmp_rt AS rt_lmp_total
    ,system_energy_price_rt AS rt_lmp_system_energy_price
    ,congestion_price_rt AS rt_lmp_congestion_price
    ,marginal_loss_price_rt AS rt_lmp_marginal_loss_price

FROM "{{ target.database }}"."pjm"."rt_hrl_lmps"
WHERE
    row_is_current = TRUE
    AND datetime_beginning_ept >= '2014-01-01'::timestamp
