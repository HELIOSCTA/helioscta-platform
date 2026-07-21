{{
  config(
    materialized='ephemeral'
  )
}}

-------------------------------------------------------------
-- NAV
-------------------------------------------------------------

WITH COMBINED AS (
    select

        sftp_date::DATE
        ,sftp_upload_timestamp::TIMESTAMP

        ,'NAV'::VARCHAR as source_table
        ,nav_reference_number::VARCHAR as reference_number
        ,account::VARCHAR

        ,exchange_name::VARCHAR
        ,exchange_code::VARCHAR

        ,is_option::BOOLEAN
        ,put_call::VARCHAR
        ,strike_price::FLOAT as strike_price
        -- TODO:
        ,NULL::NUMERIC as marex_delta

        ,contract_yyyymm::VARCHAR
        ,contract_yyyymmdd::DATE
        ,contract_year::INT
        ,contract_month::INT
        ,contract_day::INT

        ,trade_date::DATE
        -- TODO:
        ,NULL::DATE as last_trade_date

        ,nav_product::VARCHAR
        ,marex_description::VARCHAR

        ,buy_sell::VARCHAR
        ,qty::FLOAT as qty
        ,lots::FLOAT as lots

        ,settlement_price::FLOAT as settlement_price
        ,trade_price::FLOAT as trade_price
        ,market_value::FLOAT as market_value

        ,NULL::DATE as last_trade_date_filled
        ,NULL::NUMERIC as marex_delta_filled

    FROM {{ ref('staging_v6_nav_positions_2_product_lookup') }}
),

-- SELECT * FROM COMBINED
-- ORDER BY sftp_date desc, contract_yyyymm ASC

-----------------------------------------------------------
-- account names
-----------------------------------------------------------

ACCOUNTS_LOOKUP_TABLE AS (
    select distinct

        account_name
        ,account
        ,source

    FROM {{ ref('utils_v1_positions_and_trades_accounts_lookup') }}
),

COMBINED_WITH_ACCOUNT_NAMES AS (
    SELECT
        combined.*

        -- account_name
        ,lookup.account_name as account_name

    FROM COMBINED combined
    LEFT JOIN ACCOUNTS_LOOKUP_TABLE lookup ON combined.account = lookup.account
),

-- SELECT * FROM COMBINED_WITH_ACCOUNT_NAMES
-- ORDER BY sftp_date DESC, sftp_upload_timestamp DESC

-------------------------------------------------------------
-- DAYS TO EXPIRY
-------------------------------------------------------------

COMBINED_WITH_DAYS_TO_EXPIRY AS (
    SELECT
        combined.*

        -- days_to_expiry
        ,NULL::NUMERIC as days_to_expiry

    FROM COMBINED_WITH_ACCOUNT_NAMES combined
),

-- SELECT * FROM COMBINED_WITH_DAYS_TO_EXPIRY
-- ORDER BY sftp_date DESC, contract_yyyymm, contract_yyyymmdd, last_trade_date, marex_description, source_table

-------------------------------------------------------------
-- GAS LOTS
-------------------------------------------------------------

COMBINED_WITH_GAS_LOTS AS (
    SELECT
        combined.*

        -- cme_gas_qty
        ,(CASE
            WHEN lots = 2500 and exchange_code in ('HHD', 'H', 'PHH', 'PHE') THEN qty/4
            ELSE qty
        END) as gas_qty

        -- cme_gas_lots
        ,(CASE
            WHEN lots = 2500 and exchange_code in ('HHD', 'H', 'PHH', 'PHE') THEN lots*4
            ELSE lots
        END) as gas_lots

    FROM COMBINED_WITH_DAYS_TO_EXPIRY combined
),

-- SELECT * FROM COMBINED_WITH_GAS_LOTS
-- ORDER BY sftp_date DESC, contract_yyyymm, contract_yyyymmdd, last_trade_date, marex_description, source_table

-------------------------------------------------------------
-- futures_contract_month_code
-------------------------------------------------------------

futures_month_lookup AS (
    SELECT * FROM (VALUES
        (1, 'Jan', 'F'),
        (2, 'Feb', 'G'),
        (3, 'Mar', 'H'),
        (4, 'Apr', 'J'),
        (5, 'May', 'K'),
        (6, 'Jun', 'M'),
        (7, 'Jul', 'N'),
        (8, 'Aug', 'Q'),
        (9, 'Sep', 'U'),
        (10, 'Oct', 'V'),
        (11, 'Nov', 'X'),
        (12, 'Dec', 'Z')
    ) AS t(month_number, month_name, contract_code)
),

COMBINED_FUTURES_CODES AS (
    SELECT
        combined.*

        -- futures_month_code
        ,(SELECT contract_code FROM futures_month_lookup WHERE month_number = contract_month) as futures_contract_month
        ,CONCAT((SELECT contract_code FROM futures_month_lookup WHERE month_number = contract_month), RIGHT(contract_year::VARCHAR, 1)) as futures_contract_month_y
        ,CONCAT((SELECT contract_code FROM futures_month_lookup WHERE month_number = contract_month), RIGHT(contract_year::VARCHAR, 2)) as futures_contract_month_yy

    FROM COMBINED_WITH_GAS_LOTS combined
),

FINAL AS (
    SELECT * FROM COMBINED_FUTURES_CODES
)

SELECT * FROM FINAL

ORDER BY sftp_date DESC, contract_yyyymm, contract_yyyymmdd, last_trade_date_filled, marex_description, source_table
