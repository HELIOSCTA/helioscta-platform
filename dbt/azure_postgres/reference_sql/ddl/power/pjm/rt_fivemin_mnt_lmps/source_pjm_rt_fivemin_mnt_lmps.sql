{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM settlements verified five-minute RT LMPs normalized from PJM Data Miner.
-- Grain: 1 row per five-minute interval x hub.
---------------------------

SELECT
    datetime_beginning_ept::date AS date
    ,datetime_beginning_ept AS interval_beginning_ept
    ,datetime_beginning_utc AS interval_beginning_utc
    ,datetime_beginning_ept + INTERVAL '5 minutes' AS interval_ending_ept
    ,datetime_beginning_utc + INTERVAL '5 minutes' AS interval_ending_utc

    ,pnode_id
    ,pnode_name AS hub
    ,type AS pnode_type

    ,total_lmp_rt AS rt_lmp_total
    ,system_energy_price_rt AS rt_lmp_system_energy_price
    ,congestion_price_rt AS rt_lmp_congestion_price
    ,marginal_loss_price_rt AS rt_lmp_marginal_loss_price

FROM "{{ target.database }}"."pjm"."rt_fivemin_mnt_lmps"
WHERE
    datetime_beginning_ept >= '2014-01-01'::timestamp
