{{ config(
    severity = 'error',
    tags = ['positions_and_trades_ref_tables', 'clear_street_eod_transactions', 'positions_trades_account_matching']
) }}

-- Hard gate: every nonblank Clear Street give-in/out account key must resolve.
-- Rows with blank give_in_out_firm_num can only match through a reviewed
-- account-number fallback such as GHELI/IOAGR/IOMOR/IOPNT/ITITA.

with all_history as (
    select * from {{ ref('cs_ref_65_eod_all_history') }}
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
        source_account_key,
        account_code,
        account_name,
        account_lookup_status,
        exchange,
        exch_comm_cd,
        security_description,
        instrument_description,
        quantity
    from all_history
    where nullif(trim(give_in_out_firm_num), '') is not null
      and account_lookup_status is distinct from 'matched'
)

select *
from failing_rows
