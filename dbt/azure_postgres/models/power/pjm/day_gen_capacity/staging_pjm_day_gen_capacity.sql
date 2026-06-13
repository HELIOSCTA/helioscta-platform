{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Daily Generation Capacity.
-- Grain: source contract from pjm.day_gen_capacity; primary key bid_datetime_beginning_utc.
---------------------------

SELECT
    bid_datetime_beginning_ept
    ,bid_datetime_beginning_utc
    ,eco_max
    ,emerg_max
    ,total_committed
FROM {{ ref('source_pjm_day_gen_capacity') }}
