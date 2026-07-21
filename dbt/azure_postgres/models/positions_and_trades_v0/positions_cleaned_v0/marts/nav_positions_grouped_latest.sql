{{
  config(
    materialized='ephemeral'
  )
}}

----------------------------------------
----------------------------------------

WITH LATEST_DATES AS (
  SELECT

    MAX(sftp_date) as latest_date_positions
    ,MIN(sftp_date) as second_latest_date_positions

  FROM (
    SELECT DISTINCT sftp_date
    FROM {{ ref('nav_positions_grouped') }}

    -- TODO
    WHERE
      sftp_date >= current_date - 7

    ORDER BY sftp_date DESC
    LIMIT 2
  ) subquery
),

-- SELECT * FROM LATEST_DATES

-------------------------------------------------------------
-------------------------------------------------------------

COMBINED AS (
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
      ,marex_delta

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

      -- PRICES
      ,market_value_total
      ,settlement_price_total
      ,trade_price_total

      -- TOTAL
      ,qty_total
      ,qty_acim
      ,qty_andy
      ,qty_mac
      ,qty_pnt
      ,qty_dickson
      ,qty_titan

    FROM {{ ref('nav_positions_grouped') }}

    WHERE
      sftp_date::DATE >= (SELECT second_latest_date_positions::DATE FROM LATEST_DATES)
),

-- SELECT * FROM COMBINED
-- ORDER BY sftp_date DESC, contract_yyyymm

----------------------------------------
----------------------------------------

COMBINED_WITH_PREVIOUS_SFTP_DATE AS (
    SELECT

        -- previous_sftp_date
        LAG(sftp_date, 1)
        OVER (
            PARTITION BY exchange_name, exchange_code, put_call, strike_price, contract_year, contract_month, contract_day
            ORDER BY sftp_date
        ) AS previous_sftp_date

        -- POSITIONS
        ,combined.*

    FROM COMBINED combined
),

-- SELECT * FROM COMBINED_WITH_PREVIOUS_SFTP_DATE
-- ORDER BY sftp_date DESC, contract_yyyymm, contract_yyyymmdd, last_trade_date, marex_description


----------------------------------------
----------------------------------------

COMBINED_WITH_PREVIOUS_SETTLES AS (
    SELECT
        a.*

        -- previous_marex_delta
        ,(CASE
            WHEN previous_sftp_date is NOT NULL THEN
                LAG(marex_delta, 1) OVER (PARTITION BY exchange_name, exchange_code, put_call, strike_price, contract_year, contract_month, contract_day ORDER BY sftp_date)
            ELSE NULL
        END) AS previous_marex_delta

        -- previous_market_value_total
        ,(CASE
            WHEN previous_sftp_date is NOT NULL THEN
                LAG(market_value_total, 1) OVER (PARTITION BY exchange_name, exchange_code, put_call, strike_price, contract_year, contract_month, contract_day ORDER BY sftp_date)
            ELSE NULL
        END) AS previous_market_value_total

        -- previous_settlement_price_total
        ,(CASE
            WHEN previous_sftp_date is NOT NULL THEN
                LAG(settlement_price_total, 1) OVER (PARTITION BY exchange_name, exchange_code, put_call, strike_price, contract_year, contract_month, contract_day ORDER BY sftp_date)
            ELSE NULL
        END) AS previous_settlement_price_total

        -- QTY
        ,(CASE WHEN previous_sftp_date is NOT NULL THEN LAG(qty_total, 1) OVER (PARTITION BY exchange_name, exchange_code, put_call, strike_price, contract_year, contract_month, contract_day ORDER BY sftp_date) ELSE NULL END) AS previous_qty_total

    FROM COMBINED_WITH_PREVIOUS_SFTP_DATE a
),

-- SELECT * FROM COMBINED_WITH_PREVIOUS_SETTLES
-- ORDER BY sftp_date DESC, contract_yyyymm, contract_yyyymmdd, last_trade_date, marex_description

-------------------------------------------------------------
-- PNL
-------------------------------------------------------------

COMBINED_WITH_GROUPED_PNL AS (
    select

        -- DATES
        sftp_date
        ,previous_sftp_date

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
        ,marex_delta

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

        -- PRICES
        ,market_value_total
        ,settlement_price_total
        ,trade_price_total

        -- TOTAL
        ,qty_total
        ,qty_acim
        ,qty_andy
        ,qty_mac
        ,qty_pnt
        ,qty_dickson
        ,qty_titan

        -- PREVIOUS
        ,previous_marex_delta
        ,previous_market_value_total
        ,previous_settlement_price_total
        ,previous_qty_total

        -- DOD QTY
        ,(CASE
            WHEN previous_qty_total IS NOT NULL THEN (qty_total - previous_qty_total)
            ELSE NULL
        END) AS dod_qty_total

        -- PNL
        ,(CASE
            WHEN previous_sftp_date is NOT NULL THEN (settlement_price_total - previous_settlement_price_total)
            WHEN previous_sftp_date IS NULL AND trade_price_total IS NOT NULL THEN (settlement_price_total - trade_price_total)
            ELSE NULL
        END) AS daily_change_total
        ,(CASE
            WHEN previous_sftp_date is NOT NULL THEN (settlement_price_total - previous_settlement_price_total) * qty_total * lots
            WHEN previous_sftp_date IS NULL AND trade_price_total IS NOT NULL THEN (settlement_price_total - trade_price_total) * qty_total * lots
            ELSE NULL
        END) AS daily_pnl_total

    from COMBINED_WITH_PREVIOUS_SETTLES

    WHERE
        sftp_date::DATE = (SELECT latest_date_positions::DATE FROM LATEST_DATES)
),

-- SELECT * FROM COMBINED_WITH_GROUPED_PNL
-- ORDER BY sftp_date DESC, contract_yyyymm, contract_yyyymmdd, last_trade_date, marex_description

-------------------------------------------------------------
-- FINAL
-------------------------------------------------------------

FINAL AS (
    select

        -- DATES
        sftp_date
        ,previous_sftp_date

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
        ,marex_delta
        ,previous_marex_delta

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

        -- PRICES
        ,ROUND(daily_pnl_total::NUMERIC, 3)::FLOAT as daily_pnl_total
        ,ROUND(market_value_total::NUMERIC, 3)::FLOAT as market_value_total
        ,ROUND(previous_market_value_total::NUMERIC, 3)::FLOAT as previous_market_value_total
        ,ROUND(settlement_price_total::NUMERIC, 3)::FLOAT as settlement_price_total
        ,ROUND(previous_settlement_price_total::NUMERIC, 3)::FLOAT as previous_settlement_price_total
        ,ROUND(daily_change_total::NUMERIC, 3)::FLOAT as daily_change_total
        ,ROUND(trade_price_total::NUMERIC, 3)::FLOAT as trade_price_total

        -- TOTAL
        ,qty_total
        ,previous_qty_total
        ,dod_qty_total
        ,qty_acim
        ,qty_andy
        ,qty_mac
        ,qty_pnt
        ,qty_dickson
        ,qty_titan

    from COMBINED_WITH_GROUPED_PNL
)

SELECT * FROM FINAL
ORDER BY sftp_date DESC, contract_yyyymm, contract_yyyymmdd, last_trade_date, marex_description