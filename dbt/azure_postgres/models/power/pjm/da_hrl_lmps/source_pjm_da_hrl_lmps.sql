{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM DA HRL LMPs normalized from PJM Data Miner.
-- Grain: 1 row per date x hour x hub.
---------------------------

SELECT
    datetime_beginning_ept::date AS date
    ,(EXTRACT(HOUR FROM datetime_beginning_ept) + 1)::int AS hour_ending

    ,pnode_name AS hub

    ,total_lmp_da AS da_lmp_total
    ,system_energy_price_da AS da_lmp_system_energy_price
    ,congestion_price_da AS da_lmp_congestion_price
    ,marginal_loss_price_da AS da_lmp_marginal_loss_price

FROM "{{ target.database }}"."pjm"."da_hrl_lmps"
WHERE
    row_is_current = TRUE
    AND datetime_beginning_ept >= '2014-01-01'::timestamp
