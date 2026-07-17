{{
  config(
    materialized='ephemeral'
  )
}}

----------------------------------
-- PJM active pricing-node reference data.
-- Grain: 1 current active row per pricing node ID.
----------------------------------

SELECT
    pnode_id
    ,pnode_name
    ,pnode_type
    ,pnode_subtype
    ,zone
    ,voltage_level
    ,effective_date
    ,termination_date
FROM {{ ref('source_pjm_pnode') }}
