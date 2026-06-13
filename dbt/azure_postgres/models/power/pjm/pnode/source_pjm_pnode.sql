{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM active pricing nodes normalized from PJM Data Miner 2.
-- Grain: 1 current active row per pricing node ID.
---------------------------

SELECT
    pnode_id
    ,pnode_name
    ,pnode_type
    ,pnode_subtype
    ,zone
    ,voltage_level
    ,effective_date
    ,termination_date
FROM "{{ target.database }}"."pjm"."pnode"
WHERE
    termination_date = '9999-12-31'::date
