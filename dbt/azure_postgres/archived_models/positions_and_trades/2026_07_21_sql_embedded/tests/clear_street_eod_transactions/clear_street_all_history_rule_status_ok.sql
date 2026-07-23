{{ config(
    severity = 'error',
    tags = ['positions_and_trades_v2', 'clear_street_eod_transactions', 'product_matching']
) }}

with all_history as (
    select * from {{ ref('cs_65_eod_all_history') }}
),

failing_rows as (
    select
        trade_date_from_sftp,
        sftp_date,
        sftp_upload_timestamp,
        row_number_for_trades,
        record_id,
        account_number,
        account_name,
        currency_symbol,
        exchange,
        futures_code,
        symbol,
        security_description,
        trade_type,
        security_type_code,
        cusip,
        comment_code,
        quantity,
        contract_year_month,
        net_amount,
        instr_type,
        instrument_description,
        exch_comm_cd,
        contract_yyyymm,
        contract_day,
        put_call_code,
        strike_price_normalized,
        product_code,
        product_family,
        market_name,
        underlying_product_code,
        rule_status,
        rule_match_source
    from all_history
    where rule_status is distinct from 'ok'
      and rule_status is distinct from 'non_product_cash_adjustment'
)

select *
from failing_rows
