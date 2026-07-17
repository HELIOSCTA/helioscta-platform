{{
  config(
    materialized='ephemeral'
  )
}}

-------------------------------------------------------------
-------------------------------------------------------------

WITH CLEAR_STREET_EOD_TRANSACTIONS AS (
    select

        trade_date_from_sftp
        ,sftp_upload_timestamp
        ,row_number_for_trades
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
        ,created_at
        ,updated_at

    -- FROM clear_street.eod_transactions
    FROM {{ source('clear_street_v1', 'eod_transactions') }}
)

SELECT * FROM CLEAR_STREET_EOD_TRANSACTIONS
ORDER BY trade_date_from_sftp DESC, sftp_upload_timestamp DESC

-------------------------------------------------------------
-------------------------------------------------------------

-- LATEST_SFTP_UPLOAD_TIMESTAMP as (
--     SELECT DISTINCT
--         trade_date_from_sftp::DATE as trade_date_from_sftp
--         ,sftp_upload_timestamp
--     FROM CLEAR_STREET_EOD_TRANSACTIONS
-- )

-- SELECT * FROM LATEST_SFTP_UPLOAD_TIMESTAMP
-- ORDER BY trade_date_from_sftp DESC, sftp_upload_timestamp DESC

-------------------------------------------------------------
-------------------------------------------------------------

-- FORMATTED AS (
--     select

--         -- PRIMARY KEY
--         trade_date_from_sftp  -- NOTE: DATE
--         ,sftp_upload_timestamp
--         ,row_number_for_trades

--         --
--         ,record_id
--         ,firm
--         ,organization
--         ,account_number  -- NOTE: ACCOUNTS
--         ,account_type

--         --
--         ,currency_symbol
--         ,rr

--         --
--         ,trade_date  -- NOTE: DATE

--         --
--         ,buy_sell
--         ,quantity
--         ,exchange
--         ,futures_code
--         ,symbol
--         ,contract_year_month  -- NOTE: DATE
--         ,prompt_day  -- NOTE: DATE
--         ,strike_price
--         ,put_call
--         ,security_description -- NOTE: MATCHING FOR PRODUCT CODE
--         ,trade_price  -- NOTE: PRICE
--         ,printable_price  -- NOTE: PRICE

--         --
--         ,trade_type
--         ,order_number
--         ,security_type_code

--         --
--         ,cusip  -- NOTE: MATCHING FOR PRODUCT CODE

--         --
--         ,comment_code

--         -- NOTE: CLEAR ACCOUNTS / TRADES
--         ,give_in_out_code
--         ,give_in_out_firm_num

--         ,spread_code
--         ,open_close_code
--         ,trace_num_or_unique_identifier
--         ,round_turn_half_turn_account

--         -- NOTE: TRADER / broker
--         ,executing_broker
--         ,opposing_broker

--         --
--         ,oppos_firm
--         ,commission
--         ,comm_act_type
--         ,fee_amt_1
--         ,fee_1_atype
--         ,fee_amt_2
--         ,fee_2_atype
--         ,fee_amt_3
--         ,fee_3_atype
--         ,brokerage
--         ,brkrage_atype
--         ,give_io_charge
--         ,give_io_atype
--         ,other_charges
--         ,other_atype
--         ,wire_charge
--         ,wire_chg_atype
--         ,fee_type_6
--         ,fee_type_6_atype
--         ,date -- NOTE: DATES
--         ,option_exp_date -- NOTE: DATES
--         ,last_trd_date -- NOTE: DATES
--         ,net_amount
--         ,traded_exchg
--         ,sub_exchange
--         ,exchange_name
--         ,exch_comm_cd  -- NOTE: MATCHING FOR PRODUCT CODE
--         ,multiplication_factor  -- NOTE: LOTS
--         ,subaccount
--         ,instr_type
--         ,cash_settled
--         ,instrument_description  -- NOTE: DESCRIPTION
--         ,fee_amt_4
--         ,fee_4_atype
--         ,fee_amt_5
--         ,fee_5_atype
--         ,fee_amt_7
--         ,fee_7_atype
--         ,fee_amt_8
--         ,fee_8_atype
--         ,fee_amt_9
--         ,fee_9_atype
--         ,fee_amt_10
--         ,fee_10_atype
--         ,fee_amt_11
--         ,fee_11_atype
--         ,fee_amt_12
--         ,fee_12_atype
--         ,fee_amt_13
--         ,fee_13_atype
--         ,clearing_time_hhmmss
--         ,settlement_price  -- NOTE: PRICE
--         ,broker  -- NOTE: BROKER
--         ,isin
--         ,mic

--         -- NOTE
--         ,created_at
--         ,updated_at

--     FROM CLEAR_STREET_EOD_TRANSACTIONS
-- ),

-- SELECT * FROM FORMATTED
-- WHERE trade_date_from_sftp::DATE = '2026-07-10'
-- ORDER BY trade_date_from_sftp DESC, sftp_upload_timestamp DESC

-------------------------------------------------------------
-------------------------------------------------------------

FINAL AS (
    select

        -- PRIMARY KEY
        trade_date_from_sftp::DATE  -- NOTE: DATE
        ,sftp_upload_timestamp::TIMESTAMP
        ,row_number_for_trades

        -- NOTE: DATES
        ,trade_date::DATE  -- NOTE: DATES
        ,date::DATE -- NOTE: DATES
        ,option_exp_date::DATE -- NOTE: DATES
        ,last_trd_date::DATE -- NOTE: DATES

        -- NOTE: ACCOUNTS
        ,account_number  -- NOTE: ACCOUNTS
        ,account_type  -- NOTE: ACCOUNTS
        ,give_in_out_code  -- NOTE: CLEAR ACCOUNTS / TRADES
        ,give_in_out_firm_num  -- NOTE: CLEAR ACCOUNTS / TRADES

        -- EXCHANGE
        ,traded_exchg
        ,exchange_name

        -- PRODUCTS
        ,exch_comm_cd  -- NOTE: MATCHING FOR PRODUCT CODE
        ,cusip  -- NOTE: MATCHING FOR PRODUCT CODE
        ,security_description -- NOTE: MATCHING FOR PRODUCT CODE
        ,instrument_description  -- NOTE: DESCRIPTION

        -- CONTRACT YYYY_MM_DD
        ,contract_year_month  -- NOTE: DATE
        ,prompt_day  -- NOTE: DATE

        -- OPTIONS
        ,strike_price
        ,put_call

        -- CONTRACT
        ,buy_sell
        ,quantity
        ,multiplication_factor  -- NOTE: LOTS

        -- NOTE: PRICE
        ,trade_price  -- NOTE: PRICE
        -- ,printable_price  -- NOTE: PRICE
        ,settlement_price  -- NOTE: PRICE

        -- NOTE: TRADER / broker
        ,executing_broker
        ,opposing_broker
        ,broker  -- NOTE: BROKER

    FROM FORMATTED
)

-- SELECT * FROM FINAL
-- WHERE trade_date_from_sftp::DATE = '2026-07-10'
-- ORDER BY trade_date_from_sftp DESC, sftp_upload_timestamp DESC
