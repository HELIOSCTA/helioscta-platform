with source_rows as (
    select * from {{ source('positions_and_trades_ref', 'month_codes') }}
),

FINAL as (
    select
        month_number,
        month_name,
        month_code
    from source_rows
)

select *
from FINAL
