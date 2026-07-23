{{ config(
    severity = 'warn',
    tags = ['positions_and_trades_ref_tables', 'nav_positions', 'vendor_code_warning']
) }}

-- Warning check: NAV Excel export symbols should exist for product records
-- based on the standardized exchange route family.

with nav_rows as (
    select * from {{ ref('nav_ref_excel_20_positions_grouped') }}
),

prepared as (
    select
        nav_rows.*,
        upper(trim(coalesce(
            nullif(trim(exchange_route_code::text), ''),
            nullif(trim(exchange_name::text), '')
        ))) as vendor_route_exchange,
        coalesce(
            nullif(trim(route_family::text), ''),
            case
                when upper(trim(coalesce(
                    nullif(trim(exchange_route_code::text), ''),
                    nullif(trim(exchange_name::text), '')
                ))) in ('IFED', 'IFE', 'IPE') then 'ice'
                when upper(trim(coalesce(
                    nullif(trim(exchange_route_code::text), ''),
                    nullif(trim(exchange_name::text), '')
                ))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'nymex'
                when coalesce(
                    nullif(trim(exchange_route_code::text), ''),
                    nullif(trim(exchange_name::text), '')
                ) is null then 'missing'
                else 'unsupported'
            end
        ) as vendor_route_family
    from nav_rows
),

warning_rows as (
    select
        sftp_date,
        position_group_key,
        exchange_name,
        exchange_route_code,
        vendor_route_exchange,
        vendor_route_family,
        is_product_record,
        exchange_code_grouping,
        exchange_code_region,
        exchange_code,
        is_option,
        put_call,
        strike_price,
        contract_yyyymm,
        contract_yyyymmdd,
        contract_day,
        marex_description,
        ice_xl_symbol,
        cme_excel_symbol,
        bbg_option_description,
        lots,
        qty_total
    from prepared
    where coalesce(is_product_record, true)
      and (
        nullif(trim(exchange_code_grouping::text), '') is null
       or vendor_route_family in ('missing', 'unsupported')
       or vendor_route_family not in ('ice', 'nymex')
       or (
            vendor_route_family = 'ice'
            and nullif(trim(ice_xl_symbol::text), '') is null
        )
       or (
            vendor_route_family = 'nymex'
            and nullif(trim(cme_excel_symbol::text), '') is null
            and nullif(trim(bbg_option_description::text), '') is null
        )
    )
),

FINAL as (
    select * from warning_rows
)

select *
from FINAL
