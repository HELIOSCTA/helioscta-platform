-- MUFG-shaped all-history Clear Street extract.
--
-- This keeps the same export-facing columns and give-in/out filter as
-- cs_ref_80_mufg_latest, without narrowing to the latest Clear Street upload.

with trades as (
    select * from {{ ref('cs_ref_65_eod_all_history') }}
),

FINAL as (
    select
        -- Raw Clear Street columns in legacy outbound order.
        record_id as "RECORD_ID",
        firm as "FIRM",
        organization as "ORGANIZATION",
        account_number as "ACCOUNT_NUMBER",
        account_type as "ACCOUNT_TYPE",
        currency_symbol as "CURRENCY_SYMBOL",
        rr as "RR",
        trade_date as "TRADE_DATE",
        buy_sell as "BUY_SELL",
        quantity as "QUANTITY",
        exchange as "EXCHANGE",
        futures_code as "FUTURES_CODE",
        symbol as "SYMBOL",
        contract_year_month as "CONTRACT_YEAR_MONTH",
        prompt_day as "PROMPT_DAY",
        strike_price as "STRIKE_PRICE",
        put_call as "PUT_CALL",
        security_description as "SECURITY_DESCRIPTION",
        trade_price as "TRADE_PRICE",
        printable_price as "PRINTABLE_PRICE",
        trade_type as "TRADE_TYPE",
        order_number as "ORDER_NUMBER",
        security_type_code as "SECURITY_TYPE_CODE",
        cusip as "CUSIP",
        comment_code as "COMMENT_CODE",
        give_in_out_code as "GIVE_IN_OUT_CODE",
        give_in_out_firm_num as "GIVE_IN_OUT_FIRM_NUM",
        spread_code as "SPREAD_CODE",
        open_close_code as "OPEN_CLOSE_CODE",
        trace_num_or_unique_identifier as "TRACE_NUM_OR_UNIQUE_IDENTIFIER",
        round_turn_half_turn_account as "ROUND_TURN_HALF_TURN_ACCOUNT",
        executing_broker as "EXECUTING_BROKER",
        opposing_broker as "OPPOSING_BROKER",
        oppos_firm as "OPPOS_FIRM",
        commission as "COMMISSION",
        comm_act_type as "COMM_ACT_TYPE",
        fee_amt_1 as "FEE_AMT_1",
        fee_1_atype as "FEE_1_ATYPE",
        fee_amt_2 as "FEE_AMT_2",
        fee_2_atype as "FEE_2_ATYPE",
        fee_amt_3 as "FEE_AMT_3",
        fee_3_atype as "FEE_3_ATYPE",
        brokerage as "BROKERAGE",
        brkrage_atype as "BRKRAGE_ATYPE",
        give_io_charge as "GIVE_IO_CHARGE",
        give_io_atype as "GIVE_IO_ATYPE",
        other_charges as "OTHER_CHARGES",
        other_atype as "OTHER_ATYPE",
        wire_charge as "WIRE_CHARGE",
        wire_chg_atype as "WIRE_CHG_ATYPE",
        fee_type_6 as "FEE_TYPE_6",
        fee_type_6_atype as "FEE_TYPE_6_ATYPE",
        date as "DATE",
        option_exp_date as "OPTION_EXP_DATE",
        last_trd_date as "LAST_TRD_DATE",
        net_amount as "NET_AMOUNT",
        traded_exchg as "TRADED_EXCHG",
        sub_exchange as "SUB_EXCHANGE",
        exchange_name as "EXCHANGE_NAME",
        exch_comm_cd as "EXCH_COMM_CD",
        multiplication_factor as "MULTIPLICATION_FACTOR",
        subaccount as "SUBACCOUNT",
        instr_type as "INSTR_TYPE",
        cash_settled as "CASH_SETTLED",
        instrument_description as "INSTRUMENT_DESCRIPTION",
        fee_amt_4 as "FEE_AMT_4",
        fee_4_atype as "FEE_4_ATYPE",
        fee_amt_5 as "FEE_AMT_5",
        fee_5_atype as "FEE_5_ATYPE",
        fee_amt_7 as "FEE_AMT_7",
        fee_7_atype as "FEE_7_ATYPE",
        fee_amt_8 as "FEE_AMT_8",
        fee_8_atype as "FEE_8_ATYPE",
        fee_amt_9 as "FEE_AMT_9",
        fee_9_atype as "FEE_9_ATYPE",
        fee_amt_10 as "FEE_AMT_10",
        fee_10_atype as "FEE_10_ATYPE",
        fee_amt_11 as "FEE_AMT_11",
        fee_11_atype as "FEE_11_ATYPE",
        fee_amt_12 as "FEE_AMT_12",
        fee_12_atype as "FEE_12_ATYPE",
        fee_amt_13 as "FEE_AMT_13",
        fee_13_atype as "FEE_13_ATYPE",
        clearing_time_hhmmss as "CLEARING_TIME_HHMMSS",
        settlement_price as "SETTLEMENT_PRICE",
        broker as "BROKER",
        isin as "ISIN",
        mic as "MIC",

        -- Derived fields appended in the legacy MUFG CSV order.
        -- MUFG bad-mapping warning contract:
        -- - blank/null product_code_grouping means taxonomy mapping failed for
        --   product records.
        -- - ICE exchange routes (IFED/IFE/IPE) require ice_product_code.
        -- - NYMEX route-family rows (NYME/NYM/NYMEX/NMY) require
        --   cme_product_code or bbg_product_code.
        -- The backend upload warning reads these fields plus raw EXCHANGE/
        -- EXCHANGE_NAME; this model does not persist a separate warning flag.
        'New' as trade_status,
        ice_product_code,
        case when route_family = 'ice' then null else cme_product_code end as cme_product_code,
        case when route_family = 'ice' then null else bbg_product_code end as bbg_product_code,
        product_code_grouping
    from trades
    -- MUFG handoff is limited to the legacy give-in/out firms.
    where give_in_out_firm_num in ('ADU', '905')
)

select *
from FINAL
order by
    "TRADE_DATE" desc,
    product_code_grouping,
    "RECORD_ID"
