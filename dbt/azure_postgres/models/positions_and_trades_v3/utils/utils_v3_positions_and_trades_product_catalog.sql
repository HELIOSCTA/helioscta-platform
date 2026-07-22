with source_rows as (
    select * from {{ source('positions_and_trades_ref', 'product_catalog') }}
),

FINAL as (
    select
        product_code,
        product_family,
        market_name,
        underlying_product_code,
        bbg_exchange_code,
        default_exchange_name
    from source_rows
)

select *
from FINAL
