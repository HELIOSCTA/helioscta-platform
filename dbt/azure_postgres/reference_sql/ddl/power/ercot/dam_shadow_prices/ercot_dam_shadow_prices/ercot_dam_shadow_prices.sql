{{
  config(
    materialized='ephemeral'
  )
}}

SELECT * FROM {{ ref('staging_ercot_dam_shadow_prices') }}
