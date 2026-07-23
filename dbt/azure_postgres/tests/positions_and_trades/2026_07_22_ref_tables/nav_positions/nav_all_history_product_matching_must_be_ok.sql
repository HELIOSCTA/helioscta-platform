{{ config(
    severity = 'error',
    tags = ['positions_and_trades_ref_tables', 'nav_positions', 'positions_trades_product_matching']
) }}

-- Hard gate: every NAV all-history row must resolve to a usable product and
-- contract.

with all_history as (
    select * from {{ ref('nav_ref_40_positions_all_history') }}
),

failing_rows as (
    select
        fund_code,
        source_legal_entity,
        source_file_name,
        source_file_row_number,
        nav_date,
        sftp_upload_timestamp,
        account_group,
        account,
        account_name,
        product,
        type,
        month_year,
        client_symbol,
        strike_price,
        call_put,
        product_code,
        product_code_family,
        product_code_grouping,
        product_code_region,
        product_code_underlying,
        product_family,
        market_name,
        contract_yyyymm,
        contract_day,
        put_call_code,
        strike_price_normalized,
        rule_status,
        rule_priority,
        rule_match_type,
        rule_pattern
    from all_history
    where rule_status is distinct from 'ok'
)

select *
from failing_rows
