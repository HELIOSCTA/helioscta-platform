{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM verified five-minute RT LMPs normalized from PJM Data Miner 2.
-- Grain: 1 row per five-minute interval x pricing node.
-- Runtime scope: hub, zone, and interface rows.
---------------------------

SELECT
    datetime_beginning_ept::date AS date
    ,datetime_beginning_ept AS interval_beginning_ept
    ,datetime_beginning_utc AS interval_beginning_utc
    ,datetime_beginning_ept + INTERVAL '5 minutes' AS interval_ending_ept
    ,datetime_beginning_utc + INTERVAL '5 minutes' AS interval_ending_utc

    ,pnode_id
    ,pnode_name AS pricing_node
    ,type AS pnode_type
    ,row_is_current
    ,version_nbr

    ,total_lmp_rt AS rt_lmp_total
    ,system_energy_price_rt AS rt_lmp_system_energy_price
    ,congestion_price_rt AS rt_lmp_congestion_price
    ,marginal_loss_price_rt AS rt_lmp_marginal_loss_price

FROM "{{ target.database }}"."pjm"."rt_fivemin_hrl_lmps"
WHERE
    row_is_current = TRUE
    AND UPPER(type) IN ('HUB', 'ZONE', 'INTERFACE')
    AND datetime_beginning_ept >= '2014-01-01'::timestamp
