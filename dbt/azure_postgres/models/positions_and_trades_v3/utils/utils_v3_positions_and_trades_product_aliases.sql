with source_rows as (
    select * from {{ source('positions_and_trades_ref', 'product_alias_rules') }}
),

FINAL as (
    select
        source_priority,
        source,
        match_type,
        pattern,
        product_code,
        option_type,
        marex_product
    from source_rows
)

select *
from FINAL
