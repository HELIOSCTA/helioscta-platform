{{
  config(
    materialized='ephemeral',
    unique_key='sftp_date',
    incremental_strategy='delete+insert'
  )
}}

-------------------------------------------------------------
-------------------------------------------------------------

WITH COMBINED AS (
    select

        -- DATES
        sftp_date

        -- ACCOUNTS
        ,source_table
        ,reference_number
        ,account
        ,account_name

        -- TRADE DATES
        ,trade_date
        ,last_trade_date_filled as last_trade_date
        ,days_to_expiry

        -- EXCHANGE
        ,exchange_name
        ,exchange_code_grouping
        ,exchange_code_region
        ,exchange_code
        ,exchange_code_underlying

        -- OPTIONS
        ,is_option
        ,put_call
        ,strike_price
        ,marex_delta_filled as marex_delta

        -- DATES
        ,contract_yyyymm
        ,contract_yyyymmdd
        ,contract_year
        ,contract_month
        ,contract_day
        ,futures_contract_month
        ,futures_contract_month_y
        ,futures_contract_month_yy

        -- DESCRIPTIONS
        ,nav_product
        ,marex_description

        -- EXCEL CODES
        ,ice_xl_symbol
        ,ice_xl_symbol_underlying
        ,cme_excel_symbol
        ,bbg_symbol
        ,bbg_option_description

        -- LOTS
        ,gas_lots::FLOAT as lots

        -- BUY/SELL
        ,buy_sell

        -- QUANTITY
        ,gas_qty as qty

        -- PRICES
        ,settlement_price
        ,trade_price
        ,market_value

    FROM {{ ref('staging_v6_nav_positions') }}
    {% if is_incremental() %}
    WHERE sftp_date >= (SELECT MAX(sftp_date) - INTERVAL '14 days' FROM {{ this }})
    {% endif %}
),

-- SELECT * FROM COMBINED
-- ORDER BY sftp_date DESC, contract_yyyymm

-------------------------------------------------------------
-- GROUPED
-------------------------------------------------------------

GROUPED AS (
    select

      -- DATES
      sftp_date

      -- TRADE DATES
      ,last_trade_date
      ,days_to_expiry

      -- EXCHANGE
      ,exchange_name
      ,exchange_code_grouping
      ,exchange_code_region
      ,exchange_code
      ,exchange_code_underlying

      -- OPTIONS
      ,is_option
      ,put_call
      ,strike_price

      -- CONTRACT DATES
      ,contract_yyyymm
      ,contract_yyyymmdd
      ,contract_year
      ,contract_month
      ,contract_day
      ,futures_contract_month
      ,futures_contract_month_y
      ,futures_contract_month_yy

      -- DESCRIPTION
      ,marex_description

      -- EXCEL CODES
      ,ice_xl_symbol
      ,ice_xl_symbol_underlying
      ,cme_excel_symbol
      ,bbg_symbol
      ,bbg_option_description

      -- LOTS
      ,lots

      -- OPTIONS
      ,AVG(marex_delta) AS marex_delta

      -- PRICES
      ,SUM(market_value) as market_value_total
      ,AVG(settlement_price) as settlement_price_total
      ,AVG(trade_price) as trade_price_total

      -- TOTAL
      ,SUM(qty) as qty_total
      ,SUM(CASE WHEN account_name = 'ACIM' THEN qty ELSE 0 END) AS qty_acim
      ,SUM(CASE WHEN account_name = 'ANDY' THEN qty ELSE 0 END) AS qty_andy
      ,SUM(CASE WHEN account_name = 'MAC' THEN qty ELSE 0 END) AS qty_mac
      ,SUM(CASE WHEN account_name = 'PNT' THEN qty ELSE 0 END) AS qty_pnt
      ,SUM(CASE WHEN account_name = 'DICKSON' THEN qty ELSE 0 END) AS qty_dickson
      ,SUM(CASE WHEN account_name = 'TITAN' THEN qty ELSE 0 END) AS qty_titan

    from COMBINED
    GROUP BY

      -- DATES
      sftp_date

      -- TRADE DATES
      ,last_trade_date
      ,days_to_expiry

      -- EXCHANGE
      ,exchange_name
      ,exchange_code_grouping
      ,exchange_code_region
      ,exchange_code
      ,exchange_code_underlying

      -- OPTIONS
      ,is_option
      ,put_call
      ,strike_price

      -- CONTRACT DATES
      ,contract_yyyymm
      ,contract_yyyymmdd
      ,contract_year
      ,contract_month
      ,contract_day
      ,futures_contract_month
      ,futures_contract_month_y
      ,futures_contract_month_yy

      -- DESCRIPTION
      ,marex_description

      -- EXCEL CODES
      ,ice_xl_symbol
      ,ice_xl_symbol_underlying
      ,cme_excel_symbol
      ,bbg_symbol
      ,bbg_option_description

      -- LOTS
      ,lots
),

FINAL AS (
    SELECT * FROM GROUPED
)

SELECT * FROM FINAL

ORDER BY sftp_date DESC, exchange_code_grouping, exchange_code, is_option, put_call, strike_price, days_to_expiry, contract_yyyymm
