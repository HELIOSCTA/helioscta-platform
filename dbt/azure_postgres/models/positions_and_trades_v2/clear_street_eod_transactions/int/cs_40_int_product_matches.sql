-- Product match candidates for Clear Street rows.
--
-- Matching runs in priority order:
-- 1. targeted CUSIP override for PMI/P1X options
-- 2. explicit Clear Street exchange commodity code in the product catalog

with trades as (
    select * from {{ ref('cs_30_int_trade_attrs') }}
),

product_catalog as (
    select * from {{ ref('utils_v2_positions_and_trades_product_catalog') }}
)

select
    trades.*,

    -- Targeted CUSIP override handles PMI/P1X option rows where the CUSIP is
    -- the clearest product discriminator.
    cusip_catalog.product_code as cusip_product_code,
    cusip_catalog.product_family as cusip_product_family,
    cusip_catalog.market_name as cusip_market_name,
    cusip_catalog.underlying_product_code as cusip_underlying_product_code,
    cusip_catalog.bbg_exchange_code as cusip_bbg_exchange_code,
    cusip_catalog.default_exchange_name as cusip_default_exchange_name,

    -- Direct product-code matches from Clear Street exchange commodity codes.
    explicit_catalog.product_code as explicit_product_code,
    explicit_catalog.product_family as explicit_product_family,
    explicit_catalog.market_name as explicit_market_name,
    explicit_catalog.underlying_product_code as explicit_underlying_product_code,
    explicit_catalog.bbg_exchange_code as explicit_bbg_exchange_code,
    explicit_catalog.default_exchange_name as explicit_default_exchange_name
from trades
left join product_catalog as cusip_catalog
    on trades.is_option
    and (
        (
            upper(trades.cusip) like 'IFEDPMI%'
            and cusip_catalog.product_code = 'PMI'
        )
        or (
            upper(trades.cusip) like 'IFEDP1X%'
            and cusip_catalog.product_code = 'P1X'
        )
    )
left join product_catalog as explicit_catalog
    on cusip_catalog.product_code is null
    and explicit_catalog.product_code = upper(trades.exch_comm_cd_clean)
