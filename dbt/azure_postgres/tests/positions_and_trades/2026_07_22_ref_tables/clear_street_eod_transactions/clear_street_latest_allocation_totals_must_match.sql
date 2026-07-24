{{ config(
    severity = 'error',
    tags = ['positions_and_trades_ref_tables', 'clear_street_eod_transactions', 'positions_trades_allocation_total_matching']
) }}

-- Hard gate for the current Clear Street file: every allocation give-out row
-- should reconcile to the raw parent total evidence exposed by the model.

with latest as (
    select * from {{ ref('cs_ref_70_eod_latest') }}
),

failing_rows as (
    select
        trade_date_from_sftp,
        sftp_date,
        sftp_upload_timestamp,
        row_number_for_trades,
        record_id,
        account_number,
        give_in_out_code,
        give_in_out_firm_num,
        clear_street_row_family,
        allocation_total_group_qty,
        allocation_total_group_rows,
        allocation_total_match_status,
        allocation_total_match_source,
        allocation_total_match_qty,
        allocation_total_match_rows,
        futures_code,
        contract_year_month,
        prompt_day,
        put_call,
        strike_price,
        trade_price,
        order_number,
        buy_sell,
        quantity
    from latest
    where clear_street_row_family = 'allocation_give_out'
      and allocation_total_match_status is distinct from 'matched'
),

FINAL as (
    select * from failing_rows
)

select *
from FINAL
