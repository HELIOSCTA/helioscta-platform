{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Generation by Fuel Type normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.gen_by_fuel; primary key datetime_beginning_utc, fuel_type.
---------------------------

SELECT
    datetime_beginning_utc
    ,datetime_beginning_ept
    ,fuel_type
    ,mw
    ,fuel_percentage_of_total
    ,is_renewable
FROM "{{ target.database }}"."pjm"."gen_by_fuel"
WHERE
    datetime_beginning_ept >= '2016-01-01'::timestamp
