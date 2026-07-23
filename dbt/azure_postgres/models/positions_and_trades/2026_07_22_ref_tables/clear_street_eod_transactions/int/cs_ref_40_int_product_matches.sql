-- Product match candidates for Clear Street rows.
--
-- Matching runs in priority order:
-- 1. reviewed Clear Street CUSIP-prefix alias rules
-- 2. explicit Clear Street exchange commodity code in the product catalog

with trades as (
    select * from {{ ref('cs_ref_30_int_trade_attrs') }}
),

product_catalog as (
    select * from {{ ref('utils_ref_positions_and_trades_product_catalog') }}
),

product_aliases as (
    select * from {{ ref('utils_ref_positions_and_trades_product_aliases') }}
    where source = 'clear_street'
),

FINAL as (
    select
    trades.*,

    -- Clear Street CUSIP-prefix alias rules handle option rows where the CUSIP
    -- is the clearest product discriminator.
    cusip_match.product_code as cusip_product_code,
    cusip_match.product_family as cusip_product_family,
    cusip_match.market_name as cusip_market_name,
    cusip_match.underlying_product_code as cusip_underlying_product_code,
    cusip_match.bbg_exchange_code as cusip_bbg_exchange_code,
    cusip_match.default_exchange_name as cusip_default_exchange_name,

    -- Direct product-code matches from Clear Street exchange commodity codes.
    explicit_catalog.product_code as explicit_product_code,
    explicit_catalog.product_family as explicit_product_family,
    explicit_catalog.market_name as explicit_market_name,
    explicit_catalog.underlying_product_code as explicit_underlying_product_code,
    explicit_catalog.bbg_exchange_code as explicit_bbg_exchange_code,
    explicit_catalog.default_exchange_name as explicit_default_exchange_name
from trades
left join lateral (
    select
        product_catalog.product_code,
        product_catalog.product_family,
        product_catalog.market_name,
        product_catalog.underlying_product_code,
        product_catalog.bbg_exchange_code,
        product_catalog.default_exchange_name
    from product_aliases
    inner join product_catalog
        on product_catalog.product_code = product_aliases.product_code
    where product_aliases.match_type = 'cusip_prefix'
        and trades.is_option
        and upper(trades.cusip) like product_aliases.pattern || '%'
        and (
            product_aliases.option_type is null
            or product_aliases.option_type = 'option'
        )
    order by product_aliases.source_priority
    limit 1
) as cusip_match on true
left join product_catalog as explicit_catalog
    on cusip_match.product_code is null
    and explicit_catalog.product_code = upper(trades.exch_comm_cd_clean)
)

select *
from FINAL
