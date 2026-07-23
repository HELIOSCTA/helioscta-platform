-- Source workbook: nav_position_file_2026_july_21.xlsm
-- Source Power Query: ICE_BALDAY
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
        ,days_to_expiry as "DTE"

        -- EXCHANGE
        -- ,exchange_name
        ,exchange_code as "Exchange Code"
        ,exchange_code_grouping as "Grouping"
        ,exchange_code_region as "Region"

        -- -- OPTIONS
        -- ,is_option
        -- ,put_call
        -- ,strike_price
        -- -- OPTIONS
        -- ,marex_delta
        -- ,previous_marex_delta

        -- CONTRACT DATES
        -- ,contract_yyyymm
        ,LEFT(contract_yyyymm, 4) || '-' || RIGHT(contract_yyyymm, 2) AS "YYYYMM"
        ,contract_yyyymmdd AS "YYYYMMDD"
        -- ,contract_year
        -- ,contract_month
        -- ,contract_day

        -- DESCRIPTION
        ,marex_description as "MAREX Description"
        -- ,marex_product
        ,ice_xl_symbol as "ICE XL"
        -- ,cme_excel_symbol
        -- ,bloomberg_symbol
        -- ,option_description

        -- LOTS
        ,lots as "ICE Lots"

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
        -- exchange_code_grouping in ('SHORT_TERM_POWER', 'SHORT_TERM_POWER_RT')
        exchange_code in ('PWA', 'PDP', 'PDA')
        AND (days_to_expiry >= -1 or days_to_expiry is NULL)

    ORDER BY
        sftp_date DESC
        ,contract_yyyymmdd
        ,exchange_code
        ,CASE exchange_code_grouping
            WHEN 'SHORT_TERM_POWER_RT' THEN 1
            WHEN 'SHORT_TERM_POWER' THEN 2
            ELSE 999
        END
        ,CASE exchange_code_region
            WHEN 'PJM' THEN 1
            ELSE 999
        END
        ,days_to_expiry
)

-- SELECT distinct "Exchange Code" FROM COMBINED
SELECT * FROM COMBINED
