{{
  config(
    materialized='ephemeral'
  )
}}

SELECT * FROM {{ ref('staging_isone_lmps_da_hourly') }}
