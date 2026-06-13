{{
  config(
    materialized='ephemeral'
  )
}}

SELECT * FROM {{ ref('staging_ercot_resource_outage_capacity_hourly') }}
