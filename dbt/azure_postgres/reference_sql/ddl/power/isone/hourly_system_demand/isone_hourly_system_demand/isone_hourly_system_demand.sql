{{
  config(
    materialized='ephemeral'
  )
}}

SELECT * FROM {{ ref('staging_isone_hourly_system_demand') }}
