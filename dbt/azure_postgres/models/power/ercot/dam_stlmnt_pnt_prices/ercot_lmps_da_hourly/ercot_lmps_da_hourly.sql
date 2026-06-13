{{
  config(
    materialized='ephemeral'
  )
}}

SELECT * FROM {{ ref('staging_ercot_lmps_da_hourly') }}

