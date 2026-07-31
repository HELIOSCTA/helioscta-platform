{{-
  config(
    materialized='ephemeral'
  )
}}

with source_rows as (
    select *
    from {{ source('pjm', 'gen_by_fuel') }}
),

FINAL as (
    select *
    from source_rows
)

select *
from FINAL
