with latest_positions as (
    select * from {{ ref('nav_ref_50_positions_latest') }}
),

FINAL as (
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
    from latest_positions
    where rule_status <> 'ok'
      and is_product_record
)

select *
from FINAL
order by source_date desc, rule_status, source_product
