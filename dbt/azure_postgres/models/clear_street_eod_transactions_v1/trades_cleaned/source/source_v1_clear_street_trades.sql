{{
  config(
    materialized='ephemeral'
  )
}}

-------------------------------------------------------------
-------------------------------------------------------------

WITH SFTP_TRADES_UPSERT AS (
    select

        -- DATES
        trade_date_from_sftp::DATE as sftp_date
        ,sftp_upload_timestamp::TIMESTAMP as sftp_upload_timestamp

        -- PRIMARY KEYS
        ,trade_date::DATE as trade_date
        ,NULLIF(cusip::VARCHAR, 'nan') as cusip
        ,NULLIF(trace_num_or_unique_identifier::VARCHAR, 'nan') as trace_num_or_unique_identifier
        ,NULLIF(order_number::VARCHAR, 'nan') as order_number
        ,NULLIF(instrument_description::VARCHAR, 'nan') as instrument_description
        ,NULLIF(security_description::VARCHAR, 'nan') as security_description
        ,contract_year_month::INTEGER as contract_year_month
        ,prompt_day::INTEGER as prompt_day
        ,NULLIF(put_call::VARCHAR, 'nan') as put_call
        ,strike_price::FLOAT as strike_price
        ,buy_sell::INTEGER as buy_sell
        ,quantity::INTEGER as quantity
        ,trade_price::FLOAT as trade_price

        -- COLS
        ,NULLIF(record_id::VARCHAR, 'nan') as record_id
        ,NULLIF(firm::VARCHAR, 'nan') as firm
        ,NULLIF(organization::VARCHAR, 'nan') as organization
        ,NULLIF(account_number::VARCHAR, 'nan') as account_number
        ,NULLIF(account_type::VARCHAR, 'nan') as account_type
        ,NULLIF(currency_symbol::VARCHAR, 'nan') as currency_symbol
        ,NULLIF(rr::VARCHAR, 'nan') as rr
        ,NULLIF(exchange::VARCHAR, 'nan') as exchange
        ,NULLIF(futures_code::VARCHAR, 'nan') as futures_code
        ,NULLIF(symbol::VARCHAR, 'nan') as symbol
        ,printable_price::FLOAT as printable_price
        ,NULLIF(trade_type::VARCHAR, 'nan') as trade_type
        ,NULLIF(security_type_code::VARCHAR, 'nan') as security_type_code
        ,NULLIF(comment_code::VARCHAR, 'nan') as comment_code
        ,NULLIF(give_in_out_code::VARCHAR, 'nan') as give_in_out_code
        ,NULLIF(give_in_out_firm_num::VARCHAR, 'nan') as give_in_out_firm_num
        ,NULLIF(spread_code::VARCHAR, 'nan') as spread_code
        ,NULLIF(open_close_code::VARCHAR, 'nan') as open_close_code
        ,NULLIF(round_turn_half_turn_account::VARCHAR, 'nan') as round_turn_half_turn_account
        ,NULLIF(executing_broker::VARCHAR, 'nan') as executing_broker
        ,NULLIF(opposing_broker::VARCHAR, 'nan') as opposing_broker
        ,NULLIF(oppos_firm::VARCHAR, 'nan') as oppos_firm
        ,commission::FLOAT as commission
        ,NULLIF(comm_act_type::VARCHAR, 'nan') as comm_act_type
        ,fee_amt_1::FLOAT as fee_amt_1
        ,NULLIF(fee_1_atype::VARCHAR, 'nan') as fee_1_atype
        ,fee_amt_2::FLOAT as fee_amt_2
        ,NULLIF(fee_2_atype::VARCHAR, 'nan') as fee_2_atype
        ,fee_amt_3::FLOAT as fee_amt_3
        ,NULLIF(fee_3_atype::VARCHAR, 'nan') as fee_3_atype
        ,brokerage::FLOAT as brokerage
        ,NULLIF(brkrage_atype::VARCHAR, 'nan') as brkrage_atype
        ,give_io_charge::FLOAT as give_io_charge
        ,NULLIF(give_io_atype::VARCHAR, 'nan') as give_io_atype
        ,other_charges::FLOAT as other_charges
        ,NULLIF(other_atype::VARCHAR, 'nan') as other_atype
        ,wire_charge::FLOAT as wire_charge
        ,NULLIF(wire_chg_atype::VARCHAR, 'nan') as wire_chg_atype
        ,fee_type_6::FLOAT as fee_type_6
        ,NULLIF(fee_type_6_atype::VARCHAR, 'nan') as fee_type_6_atype
        ,date::DATE as date
        ,CASE WHEN option_exp_date IS NOT NULL AND option_exp_date != 'nan' THEN TO_DATE(SPLIT_PART(option_exp_date, '.', 1), 'YYYYMMDD') END as option_exp_date
        ,CASE WHEN last_trd_date IS NOT NULL AND last_trd_date != 'nan' THEN TO_DATE(SPLIT_PART(last_trd_date, '.', 1), 'YYYYMMDD') END as last_trd_date
        ,net_amount::FLOAT as net_amount
        ,NULLIF(traded_exchg::VARCHAR, 'nan') as traded_exchg
        ,NULLIF(sub_exchange::VARCHAR, 'nan') as sub_exchange
        ,NULLIF(exchange_name::VARCHAR, 'nan') as exchange_name
        ,NULLIF(exch_comm_cd::VARCHAR, 'nan') as exch_comm_cd
        ,NULLIF(multiplication_factor::VARCHAR, 'nan') as multiplication_factor
        ,NULLIF(subaccount::VARCHAR, 'nan') as subaccount
        ,NULLIF(instr_type::VARCHAR, 'nan') as instr_type
        ,NULLIF(cash_settled::VARCHAR, 'nan') as cash_settled
        ,fee_amt_4::FLOAT as fee_amt_4
        ,NULLIF(fee_4_atype::VARCHAR, 'nan') as fee_4_atype
        ,fee_amt_5::FLOAT as fee_amt_5
        ,NULLIF(fee_5_atype::VARCHAR, 'nan') as fee_5_atype
        ,fee_amt_7::FLOAT as fee_amt_7
        ,NULLIF(fee_7_atype::VARCHAR, 'nan') as fee_7_atype
        ,fee_amt_8::FLOAT as fee_amt_8
        ,NULLIF(fee_8_atype::VARCHAR, 'nan') as fee_8_atype
        ,fee_amt_9::FLOAT as fee_amt_9
        ,NULLIF(fee_9_atype::VARCHAR, 'nan') as fee_9_atype
        ,fee_amt_10::FLOAT as fee_amt_10
        ,NULLIF(fee_10_atype::VARCHAR, 'nan') as fee_10_atype
        ,fee_amt_11::FLOAT as fee_amt_11
        ,NULLIF(fee_11_atype::VARCHAR, 'nan') as fee_11_atype
        ,fee_amt_12::FLOAT as fee_amt_12
        ,NULLIF(fee_12_atype::VARCHAR, 'nan') as fee_12_atype
        ,fee_amt_13::FLOAT as fee_amt_13
        ,NULLIF(fee_13_atype::VARCHAR, 'nan') as fee_13_atype
        ,NULLIF(clearing_time_hhmmss::VARCHAR, 'nan') as clearing_time_hhmmss
        ,settlement_price::FLOAT as settlement_price
        ,NULLIF(broker::VARCHAR, 'nan') as broker
        ,NULLIF(isin::VARCHAR, 'nan') as isin
        ,NULLIF(mic::VARCHAR, 'nan') as mic

        -- MY COLUMNS
        ,created_at::TIMESTAMP as created_at
        ,updated_at::TIMESTAMP as updated_at

    -- from clear_street.eod_transactions
    FROM {{ source('clear_street_v1', 'eod_transactions') }}
),

-- SELECT * FROM SFTP_TRADES_UPSERT
-- WHERE sftp_date = '2026-01-30'
-- ORDER BY sftp_date DESC, sftp_upload_timestamp DESC

-------------------------------------------------------------
-------------------------------------------------------------

LATEST_SFTP_UPLOAD_TIMESTAMP as (
    SELECT
        sftp_date
        ,MAX(sftp_upload_timestamp) as max_timestamp
    FROM SFTP_TRADES_UPSERT
    GROUP BY sftp_date
),

-- SELECT * FROM LATEST_SFTP_UPLOAD_TIMESTAMP
-- ORDER BY sftp_date DESC, sftp_upload_timestamp DESC

-------------------------------------------------------------
-------------------------------------------------------------

CLEAR_STREET_TRADES_FILE AS (
    SELECT

        -- MY COLUMNS
        a.sftp_date
        ,a.sftp_upload_timestamp
        ,a.created_at
        ,a.updated_at

        ,record_id
        ,firm
        ,organization
        ,account_number
        ,account_type
        ,currency_symbol
        ,rr
        ,trade_date
        ,buy_sell
        ,quantity
        ,exchange
        ,futures_code
        ,symbol
        ,contract_year_month
        ,prompt_day
        ,strike_price
        ,put_call
        ,security_description
        ,trade_price
        ,printable_price
        ,trade_type
        ,order_number
        ,security_type_code
        ,cusip
        ,comment_code
        ,give_in_out_code
        ,give_in_out_firm_num
        ,spread_code
        ,open_close_code
        ,trace_num_or_unique_identifier
        ,round_turn_half_turn_account
        ,executing_broker
        ,opposing_broker
        ,oppos_firm
        ,commission
        ,comm_act_type
        ,fee_amt_1
        ,fee_1_atype
        ,fee_amt_2
        ,fee_2_atype
        ,fee_amt_3
        ,fee_3_atype
        ,brokerage
        ,brkrage_atype
        ,give_io_charge
        ,give_io_atype
        ,other_charges
        ,other_atype
        ,wire_charge
        ,wire_chg_atype
        ,fee_type_6
        ,fee_type_6_atype
        ,date
        ,option_exp_date
        ,last_trd_date
        ,net_amount
        ,traded_exchg
        ,sub_exchange
        ,exchange_name
        ,exch_comm_cd
        ,multiplication_factor
        ,subaccount
        ,instr_type
        ,cash_settled
        ,instrument_description
        ,fee_amt_4
        ,fee_4_atype
        ,fee_amt_5
        ,fee_5_atype
        ,fee_amt_7
        ,fee_7_atype
        ,fee_amt_8
        ,fee_8_atype
        ,fee_amt_9
        ,fee_9_atype
        ,fee_amt_10
        ,fee_10_atype
        ,fee_amt_11
        ,fee_11_atype
        ,fee_amt_12
        ,fee_12_atype
        ,fee_amt_13
        ,fee_13_atype
        ,clearing_time_hhmmss
        ,settlement_price
        ,broker
        ,isin
        ,mic

    FROM SFTP_TRADES_UPSERT a
    INNER JOIN LATEST_SFTP_UPLOAD_TIMESTAMP b ON a.sftp_date = b.sftp_date AND a.sftp_upload_timestamp = b.max_timestamp
)

SELECT * FROM CLEAR_STREET_TRADES_FILE
ORDER BY sftp_date DESC, sftp_upload_timestamp DESC
