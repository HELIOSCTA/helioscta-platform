with source_rows as (
    select * from {{ source('positions_and_trades_ref', 'account_lookup') }}
),

FINAL as (
    select
        account_name,
        account,
        source,
        source_label
    from source_rows
)

select *
from FINAL
