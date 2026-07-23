-- Latest Clear Street source file.
--
-- Clear Street can send multiple uploads for the same SFTP trade date. This
-- model selects the latest available trade date and then the latest upload
-- timestamp within that trade date, preserving all rows from that source file.

with trades as (
    select * from {{ ref('cs_ref_60_int_export_codes') }}
),

latest_sftp_date as (
    -- First choose the newest trade date represented in the raw load.
    select max(trade_date_from_sftp) as trade_date_from_sftp
    from trades
),

latest_source_file as (
    -- Then choose the latest upload for that date to avoid mixing revisions.
    select
        trades.trade_date_from_sftp,
        max(trades.sftp_upload_timestamp) as sftp_upload_timestamp
    from trades
    inner join latest_sftp_date
        on latest_sftp_date.trade_date_from_sftp = trades.trade_date_from_sftp
    group by trades.trade_date_from_sftp
),

latest_trades as (
    select trades.*
    from trades
    inner join latest_source_file
        on latest_source_file.trade_date_from_sftp = trades.trade_date_from_sftp
       and latest_source_file.sftp_upload_timestamp = trades.sftp_upload_timestamp
),

FINAL as (
    select
        trade_date_from_sftp,
        sftp_date,
        sftp_upload_timestamp,
        row_number_for_trades,
        record_id,
        firm,
        organization,
        account_number,
        account_type,
        currency_symbol,
        rr,
        trade_date,
        buy_sell,
        quantity,
        exchange,
        futures_code,
        symbol,
        contract_year_month,
        prompt_day,
        strike_price,
        put_call,
        security_description,
        trade_price,
        printable_price,
        trade_type,
        order_number,
        security_type_code,
        cusip,
        comment_code,
        give_in_out_code,
        give_in_out_firm_num,
        spread_code,
        open_close_code,
        trace_num_or_unique_identifier,
        round_turn_half_turn_account,
        executing_broker,
        opposing_broker,
        oppos_firm,
        commission,
        comm_act_type,
        fee_amt_1,
        fee_1_atype,
        fee_amt_2,
        fee_2_atype,
        fee_amt_3,
        fee_3_atype,
        brokerage,
        brkrage_atype,
        give_io_charge,
        give_io_atype,
        other_charges,
        other_atype,
        wire_charge,
        wire_chg_atype,
        fee_type_6,
        fee_type_6_atype,
        date,
        option_exp_date,
        last_trd_date,
        net_amount,
        traded_exchg,
        sub_exchange,
        exchange_name,
        exch_comm_cd,
        multiplication_factor,
        subaccount,
        instr_type,
        cash_settled,
        instrument_description,
        fee_amt_4,
        fee_4_atype,
        fee_amt_5,
        fee_5_atype,
        fee_amt_7,
        fee_7_atype,
        fee_amt_8,
        fee_8_atype,
        fee_amt_9,
        fee_9_atype,
        fee_amt_10,
        fee_10_atype,
        fee_amt_11,
        fee_11_atype,
        fee_amt_12,
        fee_12_atype,
        fee_amt_13,
        fee_13_atype,
        clearing_time_hhmmss,
        settlement_price,
        broker,
        isin,
        mic,
        created_at,
        updated_at,

        -- Curated derived fields for review/export. Keep intermediate cleanup,
        -- match-candidate, and vendor-code helper columns in int models.
        source_account_key,
        account_code,
        account_name,
        account_lookup_status,
        source_exchange_name,
        exchange_route_code,
        route_family,
        is_product_record,
        buy_sell_cleaned,
        quantity_cleaned,
        contract_yyyymm,
        contract_day,
        daily_trade_date,
        daily_contract_date,
        daily_contract_is_weekday,
        daily_contract_calendar_offset_days,
        daily_contract_business_offset_days,
        daily_contract_week_offset,
        put_call_code,
        strike_price_normalized,
        product_code_effective as product_code,
        product_code_family,
        product_code_grouping,
        product_code_region,
        product_code_underlying,
        product_family,
        market_name,
        underlying_product_code,
        rule_status,
        rule_match_source,
        ice_product_code,
        cme_product_code,
        bbg_product_code
    from latest_trades
)

select *
from FINAL
order by
    sftp_date desc,
    sftp_upload_timestamp desc,
    product_family,
    market_name
