{{
  config(
    materialized='ephemeral'
  )
}}

SELECT * FROM {{ ref('staging_pjm_dispatched_reserves') }}
