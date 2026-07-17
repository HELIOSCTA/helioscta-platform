{{
  config(
    materialized='ephemeral'
  )
}}

SELECT * FROM {{ ref('staging_isone_external_interface_metered_data') }}
