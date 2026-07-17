{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Real-Time Unverified Hourly LMPs normalized from PJM Data Miner 2.
-- Grain: 1 row per hourly interval x pricing node.
-- Runtime scope: hub, zone, and interface rows.
---------------------------

SELECT
    datetime_beginning_ept::date AS date
    ,(EXTRACT(HOUR FROM datetime_beginning_ept) + 1)::int AS hour_ending
    ,datetime_beginning_ept AS interval_beginning_ept
    ,datetime_beginning_utc AS interval_beginning_utc
    ,datetime_beginning_ept + INTERVAL '1 hour' AS interval_ending_ept
    ,datetime_beginning_utc + INTERVAL '1 hour' AS interval_ending_utc

    ,pnode_name AS pricing_node
    ,type AS pnode_type

    ,total_lmp_rt AS rt_lmp_total
    ,(total_lmp_rt - congestion_price_rt - marginal_loss_price_rt) AS rt_lmp_system_energy_price
    ,congestion_price_rt AS rt_lmp_congestion_price
    ,marginal_loss_price_rt AS rt_lmp_marginal_loss_price

FROM "{{ target.database }}"."pjm"."rt_unverified_hrl_lmps"
WHERE
    UPPER(type) IN ('HUB', 'ZONE', 'INTERFACE')
    AND datetime_beginning_ept >= '2014-01-01'::timestamp
