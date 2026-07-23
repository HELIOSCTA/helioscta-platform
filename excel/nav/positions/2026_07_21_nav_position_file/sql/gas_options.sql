-- Source workbook: nav_position_file_2026_july_21.xlsm
-- Source Power Query: GAS_OPTIONS
-- Extracted from: customXml/item1.xml -> DataMashup -> Formulas/Section1.m
-- Source connection: dsn=Azure PostgreSQL

---------------------------------------------------
---------------------------------------------------

WITH COMBINED AS (
    select

     -- DATES
        sftp_date as "SFTP Date"
        ,previous_sftp_date as "Previous SFTP Date"

        -- TRADE DATES
        ,last_trade_date as "Expiration"
        -- ,days_to_expiry as "DTE"
        ,999 as "DTE"

        -- EXCHANGE
        -- ,exchange_name
        ,exchange_code as "Exchange Code"
        -- ,exchange_code_grouping
        -- ,exchange_code_region

        -- OPTIONS
        -- ,is_option
        ,put_call as "P/C"
        ,strike_price as "Strike"
        -- OPTIONS
        ,marex_delta as "MAREX Delta"
        ,previous_marex_delta as "Previous Marex Delta"

        -- CONTRACT DATES
        -- ,contract_yyyymm
        ,LEFT(contract_yyyymm, 4) || '-' || RIGHT(contract_yyyymm, 2) AS "YYYYMM"
        -- ,contract_yyyymmdd
        -- ,contract_year
        -- ,contract_month
        -- ,contract_day
        ,futures_contract_month_y as "Futures Contract Code"

        -- DESCRIPTION
        ,marex_description as "Marex Description"
        -- ,marex_product
        -- ,ice_xl_symbol
        -- ,option_description
        ,cme_excel_symbol as "CME Symbol"
        -- ,bloomberg_symbol

        -- LOTS
        ,lots as "CME Gas Lots"

        -- _total
        ,qty_total as "QTY"
        -- ,previous_qty_total
        ,dod_qty_total as "DoD QTY"

        -- qty
        ,qty_acim as "ACIM"
        -- ,qty_andy as "ANDY"
        -- ,qty_mac as "MAC"
        ,qty_pnt as "PNT"
        ,qty_dickson as "DICKSON"
        ,qty_titan as "TITAN"

        -- trade and settles
        -- ,ROUND(trade_price::NUMERIC, 3) as trade_price
        ,ROUND(settlement_price_total::NUMERIC, 3) as "MAREX Settle"
        ,ROUND(previous_settlement_price_total::NUMERIC, 3) as "Previous MAREX Settle"

        -- PNL
        ,ROUND(daily_change_total::NUMERIC, 3) as "Change between Settles"
        ,ROUND(daily_pnl_total::NUMERIC, 0) as "PnL from Settles"

    from positions_cleaned_v2.nav_positions_grouped_latest

    WHERE
        exchange_code_grouping in ('GAS_OPTIONS')
        AND exchange_code in ('LN', 'PHE')
        AND (days_to_expiry >= 0 OR days_to_expiry IS NULL)

    ORDER BY
        sftp_date DESC
        ,contract_yyyymm
        ,exchange_code
        ,days_to_expiry
        ,put_call
        ,strike_price
)

SELECT * FROM COMBINED
WHERE "YYYYMM" > '202602'
