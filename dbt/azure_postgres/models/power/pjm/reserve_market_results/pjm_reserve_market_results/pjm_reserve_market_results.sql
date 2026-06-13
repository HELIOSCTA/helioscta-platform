{{
  config(
    materialized='ephemeral'
  )
}}

SELECT * FROM {{ ref('staging_pjm_reserve_market_results') }}
