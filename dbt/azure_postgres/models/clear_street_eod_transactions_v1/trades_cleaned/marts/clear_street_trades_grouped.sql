-------------------------------------------------------------
-------------------------------------------------------------

WITH TRADES AS (
    select

      -- DATES
      sftp_date

      -- TRADE DATES
      ,trade_date

      -- ACCOUNTS
      ,account_number_cleaned as clear_street_account
      ,give_in_out_firm_num
      ,account_name

      -- EXCHANGE
      ,exchange_name_cleaned as exchange_name
      ,product_code_grouping
      ,product_code_region
      ,exch_comm_cd as exchange_code

      -- OPTIONS
      ,is_option
      ,put_call
      ,strike_price

      -- CONTRACT DATES
      ,contract_year_month as contract_yyyymm
      ,contract_year
      ,contract_month
      ,contract_day

      -- DESCRIPTION
      ,security_description as contract_description

      -- prod
      ,ice_product_code
      ,ice_product_code_underlying
      ,cme_product_code

      -- PRICES
      ,trade_price
      ,settlement_price

      -- BUY/SELL
      ,buy_sell_cleaned as buy_sell

      -- QTY
      ,quantity_cleaned as qty

    -- from trades_v2_2026_feb_23.marts_v2_clear_street_trades
    FROM {{ ref('clear_street_trades') }}

    WHERE
      -- NOTE: WE NEED TO FILTER OUT TRADES WITH NO ACCOUNT NAME
      account_name IS NOT NULL
),

-- SELECT * FROM TRADES
-- ORDER BY sftp_date DESC, contract_yyyymm

-------------------------------------------------------------
-- GROUPED
-------------------------------------------------------------

GROUPED AS (
    select

        -- DATES
        sftp_date

        -- TRADE DATES
        ,trade_date

        -- ACCOUNTS
        ,clear_street_account

        -- EXCHANGE
        ,exchange_name
        ,product_code_grouping
        ,product_code_region
        ,exchange_code

        -- OPTIONS
        ,is_option
        ,put_call
        ,strike_price

        -- CONTRACT DATES
        ,contract_yyyymm
        ,contract_year
        ,contract_month
        ,contract_day

        -- DESCRIPTION
        ,contract_description

        -- prod
        ,ice_product_code
        ,ice_product_code_underlying
        ,cme_product_code

        -- SETTLEMENT PRICE
        ,AVG(settlement_price) as settlement_price

        -- TRADE PRICE
        ,AVG(trade_price) as trade_price_total
        ,AVG(CASE WHEN account_name = 'ACIM' THEN trade_price ELSE NULL END) AS trade_price_acim
        ,AVG(CASE WHEN account_name = 'ANDY' THEN trade_price ELSE NULL END) AS trade_price_andy
        ,AVG(CASE WHEN account_name = 'MAC' THEN trade_price ELSE NULL END) AS trade_price_mac
        ,AVG(CASE WHEN account_name = 'PNT' THEN trade_price ELSE NULL END) AS trade_price_pnt
        ,AVG(CASE WHEN account_name = 'DICKSON' THEN trade_price ELSE NULL END) AS trade_price_dickson
        ,AVG(CASE WHEN account_name = 'TITAN' THEN trade_price ELSE NULL END) AS trade_price_titan

        -- QTY
        ,SUM(qty) as qty_total
        ,SUM(CASE WHEN account_name = 'ACIM' THEN qty ELSE 0 END) AS qty_acim
        ,SUM(CASE WHEN account_name = 'ANDY' THEN qty ELSE 0 END) AS qty_andy
        ,SUM(CASE WHEN account_name = 'MAC' THEN qty ELSE 0 END) AS qty_mac
        ,SUM(CASE WHEN account_name = 'PNT' THEN qty ELSE 0 END) AS qty_pnt
        ,SUM(CASE WHEN account_name = 'DICKSON' THEN qty ELSE 0 END) AS qty_dickson
        ,SUM(CASE WHEN account_name = 'TITAN' THEN qty ELSE 0 END) AS qty_titan

    from TRADES
    GROUP BY

        -- DATES
        sftp_date

        -- TRADE DATES
        ,trade_date

        -- ACCOUNTS
        ,clear_street_account

        -- EXCHANGE
        ,exchange_name
        ,product_code_grouping
        ,product_code_region
        ,exchange_code

        -- OPTIONS
        ,is_option
        ,put_call
        ,strike_price

        -- CONTRACT DATES
        ,contract_yyyymm
        ,contract_year
        ,contract_month
        ,contract_day

        -- DESCRIPTION
        ,contract_description

        -- prod
        ,ice_product_code
        ,ice_product_code_underlying
        ,cme_product_code

)

SELECT * FROM GROUPED
ORDER BY sftp_date DESC, contract_yyyymm
