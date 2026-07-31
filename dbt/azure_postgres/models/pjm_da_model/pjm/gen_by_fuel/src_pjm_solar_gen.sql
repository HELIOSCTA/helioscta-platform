{{-
  config(
    materialized='ephemeral'
  )
}}

with source_rows as (
    select *
    from {{ source('pjm', 'solar_gen') }}
),

FINAL as (
    select *
    from source_rows
)

select *
from FINAL
