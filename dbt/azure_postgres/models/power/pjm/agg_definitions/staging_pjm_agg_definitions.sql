{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM current fixed weighted average aggregate definitions.
-- Grain: one active aggregate pricing node x bus pricing node x effective date.
---------------------------

SELECT
    agg_pnode_id
    ,terminate_date_ept
    ,agg_pnode_name
    ,bus_pnode_factor
    ,bus_pnode_id
    ,bus_pnode_name
    ,effective_date_ept
FROM {{ ref('source_pjm_agg_definitions') }}
