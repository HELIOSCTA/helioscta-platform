{{
  config(
    materialized='ephemeral'
  )
}}

SELECT * FROM {{ ref('staging_pjm_agg_definitions') }}
