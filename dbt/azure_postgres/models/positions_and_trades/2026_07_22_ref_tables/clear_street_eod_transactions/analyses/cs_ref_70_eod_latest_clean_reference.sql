-- Compact reference projection for the Clear Street latest mart.
--
-- Source mart:
-- models/positions_and_trades/2026_07_22_ref_tables/clear_street_eod_transactions/marts/cs_ref_70_eod_latest.sql
--
-- The source mart compiles under:
-- target/compiled/helioscta_platform/models/positions_and_trades/2026_07_22_ref_tables/clear_street_eod_transactions/marts/

with source_rows as (
    select * from {{ ref('cs_ref_70_eod_latest') }}
),

FINAL as (
    select

        -- DATES
        sftp_date::DATE as sftp_date,
        trade_date::DATE as trade_date,

        -- trader
        broker,

        -- ACCOUNTS
        account_number,
        account_name,
        account_display_name,
        account_role,

        -- EXCHANGE
        exchange_route_code as exchange,
        route_family as exchange_name,

        -- PRODUCT
        product_code_family,
        product_code_grouping,
        product_code_region,
        product_code,
        product_code_underlying,

        -- PRODUCT DATES
        contract_yyyymm,
        contract_day,

        -- LAST TRADE DATES
        last_trd_date::DATE as last_trade_date,
        option_exp_date::DATE as option_expiration_date,

        -- OPTIONS
        put_call_code as put_call,
        strike_price_normalized as strike_price,

        -- QTY
        buy_sell_cleaned as buy_sell,
        quantity_cleaned as quantity,
        multiplication_factor as lots,
        trade_price,
        settlement_price,

        -- MISC
        ice_product_code,
        cme_product_code,
        bbg_product_code

    from source_rows
    order by
        sftp_date desc,
        sftp_upload_timestamp desc,
        product_family,
        market_name
)

select *
from FINAL
