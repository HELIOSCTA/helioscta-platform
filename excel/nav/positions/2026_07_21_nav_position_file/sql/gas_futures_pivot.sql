-- Source workbook: nav_position_file_2026_july_21.xlsm
-- Source Power Query: GAS_FUTURES_PIVOT
-- Extracted from: customXml/item1.xml -> DataMashup -> Formulas/Section1.m
-- Source connection: dsn=Azure PostgreSQL

select

    sftp_date
    ,sftp_upload_timestamp
    ,source_table
    ,reference_number
    ,account
    ,exchange_name
    ,exchange_code
    ,is_option
    ,put_call
    ,strike_price
    ,marex_delta
    ,contract_yyyymm
    ,contract_yyyymmdd
    ,contract_year
    ,contract_month
    ,contract_day
    ,trade_date
    ,last_trade_date
    ,nav_product
    ,marex_description
    ,buy_sell
    ,qty
    ,lots
    ,settlement_price
    ,trade_price
    ,market_value
    -- ,ignore_nulls_ordering
    ,last_trade_date_filled
    ,marex_delta_filled
    ,account_name
    ,days_to_expiry
    ,gas_qty
    ,gas_lots
    ,futures_contract_month
    ,futures_contract_month_y
    ,futures_contract_month_yy
    ,exchange_code_grouping
    ,exchange_code_region
    ,exchange_code_underlying
    ,bbg_exchange_code
    ,ice_xl_symbol
    ,ice_xl_symbol_underlying
    ,cme_excel_symbol
    ,bbg_symbol
    ,bbg_option_description

from positions_cleaned_v2.nav_position

WHERE
    sftp_date = (SELECT MAX(sftp_date) from positions_cleaned_v2.nav_position)
    AND exchange_code_grouping in ('GAS_FUTURES')
    AND exchange_code in ('NG', 'HP', 'HH', 'PHH', 'H')
    AND (days_to_expiry >= 0 OR days_to_expiry IS NULL)
