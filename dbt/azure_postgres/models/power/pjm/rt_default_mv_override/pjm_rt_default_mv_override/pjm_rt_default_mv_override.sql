{{
  config(
    materialized='ephemeral'
  )
}}

SELECT * FROM {{ ref('staging_pjm_rt_default_mv_override') }}
