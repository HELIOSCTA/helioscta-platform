{{-
  config(
    materialized='ephemeral'
  )
}}

with source_rows as (
    select *
    from {{ source('pjm', 'gen_outages_by_type') }}
),

FINAL as (
    select *
    from source_rows
)

select *
from FINAL
