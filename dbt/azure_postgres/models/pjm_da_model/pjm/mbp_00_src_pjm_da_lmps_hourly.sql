{{
  config(
    materialized='ephemeral'
  )
}}

with source_rows as (
    select * from {{ source('pjm', 'da_hrl_lmps') }}
),

FINAL as (
    select
        datetime_beginning_ept,
        datetime_beginning_utc,
        pnode_id,
        pnode_name,
        total_lmp_da,
        system_energy_price_da,
        congestion_price_da,
        marginal_loss_price_da,
        row_is_current,
        updated_at
    from source_rows
)

select *
from FINAL
