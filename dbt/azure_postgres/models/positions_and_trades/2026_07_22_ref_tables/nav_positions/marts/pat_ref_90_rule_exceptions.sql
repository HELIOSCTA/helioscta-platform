with clear_street_exceptions as (
    select
        'clear_street' as source,
        trade_date_from_sftp as source_date,
        sftp_upload_timestamp,
        null::text as fund_code,
        null::text as source_file_name,
        null::integer as source_file_row_number,
        source_account_key,
        account_code,
        account_name,
        account_lookup_status,
        null::text as account_group,
        account_number as account,
        rule_product as source_product,
        null::text as source_type,
        null::text as month_year,
        exchange_name,
        source_exchange_name,
        exchange_route_code,
        route_family,
        is_product_record,
        product_code,
        product_family,
        market_name,
        underlying_product_code,
        null::text as contract_yyyymm,
        null::integer as contract_day,
        put_call_code,
        strike_price_normalized,
        null::double precision as market_value_in_base_currency,
        rule_status,
        rule_match_source,
        null::text as rule_match_type,
        null::text as rule_match_pattern
    from {{ ref('cs_ref_50_int_rules') }}
    where rule_status <> 'ok'
      and is_product_record
),

nav_exceptions as (
    select
        'nav' as source,
        nav_date::text as source_date,
        sftp_upload_timestamp,
        fund_code,
        source_file_name,
        source_file_row_number,
        source_account_key,
        account_code,
        account_name,
        account_lookup_status,
        account_group,
        account,
        product as source_product,
        type as source_type,
        month_year,
        exchange_name,
        source_exchange_name,
        exchange_route_code,
        route_family,
        is_product_record,
        product_code,
        product_family,
        market_name,
        underlying_product_code,
        contract_yyyymm,
        contract_day,
        put_call_code,
        strike_price_normalized,
        market_value_in_base_currency,
        rule_status,
        null::text as rule_match_source,
        rule_match_type,
        rule_pattern as rule_match_pattern
    from {{ ref('nav_ref_30_int_rules') }}
    where rule_status <> 'ok'
      and is_product_record
),

FINAL as (
    select * from clear_street_exceptions
    union all
    select * from nav_exceptions
)

select *
from FINAL
order by source, source_date desc, rule_status, source_product
