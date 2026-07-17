{{
  config(
    materialized='ephemeral'
  )
}}

SELECT * FROM {{ ref('src_isone_7d_wind') }}
