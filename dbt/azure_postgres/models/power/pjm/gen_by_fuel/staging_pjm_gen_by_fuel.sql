{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Generation by Fuel Type.
-- Grain: source contract from pjm.gen_by_fuel; primary key datetime_beginning_utc, fuel_type.
---------------------------

SELECT
    datetime_beginning_utc
    ,datetime_beginning_ept
    ,fuel_type
    ,mw
    ,fuel_percentage_of_total
    ,is_renewable
FROM {{ ref('source_pjm_gen_by_fuel') }}

