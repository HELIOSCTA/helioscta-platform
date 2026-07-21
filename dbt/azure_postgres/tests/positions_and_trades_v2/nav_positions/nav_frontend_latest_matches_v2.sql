{{ config(
    tags = ['positions_and_trades_v2', 'nav_positions', 'frontend_contract']
) }}

with v2_rows as (
    select
        fund_code,
        source_file_name,
        source_file_row_number,
        nav_date,
        sftp_upload_timestamp,
        account_group,
        account,
        product,
        upper(regexp_replace(coalesce(product, ''), '[[:space:]]+', ' ', 'g')) as product_norm,
        product_code,
        product_family as product_group,
        market_name as product_region,
        underlying_product_code,
        contract_yyyymm,
        contract_day,
        put_call_code as put_call,
        strike_price_normalized as normalized_strike_price,
        rule_status as normalization_status,
        rule_priority,
        rule_match_type,
        rule_pattern,
        quantity_1,
        cost_in_base_currency,
        market_value_in_base_currency
    from {{ ref('nav_50_positions_latest') }}
),

frontend_rows as (
    select
        fund_code,
        source_file_name,
        source_file_row_number,
        nav_date,
        sftp_upload_timestamp,
        account_group,
        account,
        product,
        product_norm,
        product_code,
        product_group,
        product_region,
        underlying_product_code,
        contract_yyyymm,
        contract_day,
        put_call,
        normalized_strike_price,
        normalization_status,
        rule_priority,
        rule_match_type,
        rule_pattern,
        quantity_1,
        cost_in_base_currency,
        market_value_in_base_currency
    from {{ ref('nav_frontend_positions_latest') }}
),

v2_minus_frontend as (
    select 'v2_minus_frontend' as mismatch_side, *
    from v2_rows
    except all
    select 'v2_minus_frontend' as mismatch_side, *
    from frontend_rows
),

frontend_minus_v2 as (
    select 'frontend_minus_v2' as mismatch_side, *
    from frontend_rows
    except all
    select 'frontend_minus_v2' as mismatch_side, *
    from v2_rows
),

FINAL as (
    select * from v2_minus_frontend
    union all
    select * from frontend_minus_v2
)

select *
from FINAL
