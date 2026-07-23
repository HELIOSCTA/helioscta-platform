{{ config(
    severity = 'warn',
    tags = ['positions_and_trades_ref_tables', 'clear_street_eod_transactions', 'vendor_code_warning']
) }}

-- Warning check: derived vendor/export codes should exist for Clear Street
-- product records based on the standardized exchange route family.

with all_history as (
    select * from {{ ref('cs_ref_65_eod_all_history') }}
),

prepared as (
    select
        all_history.*,
        upper(trim(coalesce(
            nullif(trim(exchange_route_code::text), ''),
            nullif(trim(exchange_name::text), ''),
            nullif(trim(exchange::text), '')
        ))) as vendor_route_exchange,
        coalesce(
            nullif(trim(route_family::text), ''),
            case
                when upper(trim(coalesce(
                    nullif(trim(exchange_route_code::text), ''),
                    nullif(trim(exchange_name::text), ''),
                    nullif(trim(exchange::text), '')
                ))) in ('IFED', 'IFE', 'IPE') then 'ice'
                when upper(trim(coalesce(
                    nullif(trim(exchange_route_code::text), ''),
                    nullif(trim(exchange_name::text), ''),
                    nullif(trim(exchange::text), '')
                ))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'nymex'
                when coalesce(
                    nullif(trim(exchange_route_code::text), ''),
                    nullif(trim(exchange_name::text), ''),
                    nullif(trim(exchange::text), '')
                ) is null then 'missing'
                else 'unsupported'
            end
        ) as vendor_route_family
    from all_history
),

warning_rows as (
    select
        trade_date_from_sftp,
        sftp_date,
        sftp_upload_timestamp,
        row_number_for_trades,
        record_id,
        account_number,
        account_name,
        account_code,
        account_lookup_status,
        exchange,
        exchange_name,
        source_exchange_name,
        exchange_route_code,
        vendor_route_exchange,
        vendor_route_family,
        is_product_record,
        futures_code,
        symbol,
        security_description,
        instrument_description,
        exch_comm_cd,
        contract_yyyymm,
        contract_day,
        product_code,
        product_code_grouping,
        ice_product_code,
        cme_product_code,
        bbg_product_code
    from prepared
    where coalesce(is_product_record, true)
      and (
        nullif(trim(product_code_grouping::text), '') is null
       or vendor_route_family in ('missing', 'unsupported')
       or vendor_route_family not in ('ice', 'nymex')
       or (
            vendor_route_family = 'ice'
            and nullif(trim(ice_product_code::text), '') is null
        )
       or (
            vendor_route_family = 'nymex'
            and nullif(trim(cme_product_code::text), '') is null
            and nullif(trim(bbg_product_code::text), '') is null
        )
    )
),

FINAL as (
    select * from warning_rows
)

select *
from FINAL
