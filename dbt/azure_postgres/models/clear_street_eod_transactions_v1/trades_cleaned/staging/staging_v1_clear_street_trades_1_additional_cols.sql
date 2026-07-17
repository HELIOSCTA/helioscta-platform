{{
  config(
    materialized='ephemeral'
  )
}}

-------------------------------------------------------------
-------------------------------------------------------------

WITH TRADES AS (
    SELECT * FROM {{ ref('source_v1_clear_street_trades') }}
),

-- SELECT * FROM TRADES
-- ORDER BY sftp_date DESC, sftp_upload_timestamp DESC

-------------------------------------------------------------
-------------------------------------------------------------

TRADES_WITH_ADDITIONAL_COLS AS (
  SELECT
      *

        -- Create TRADE_STATUS from OPEN_CLOSE_CODE mapping
        ,CASE
            WHEN open_close_code = 'O' THEN 'New'
            ELSE NULL
        END AS trade_status

        -- CONTRACT DATES
        ,CASE
            WHEN contract_year_month::TEXT ~ '^\d{6}$' THEN LEFT(contract_year_month::TEXT, 4)::INT
            ELSE NULL
        END AS contract_year
        ,CASE
            WHEN contract_year_month::TEXT ~ '^\d{6}$' THEN RIGHT(contract_year_month::TEXT, 2)::INT
            ELSE NULL
        END AS contract_month
        ,CASE
            WHEN prompt_day > 0 THEN prompt_day::INT
            ELSE NULL
        END AS contract_day

        -- is_option
        ,CASE
            WHEN put_call in ('C', 'P') THEN TRUE
            ELSE FALSE
        END AS is_option

        -- exchange_name
        ,CASE
            WHEN exchange_name = 'NYM' THEN 'NYME'
            WHEN exchange_name = 'IFE' THEN 'IFED'
            WHEN exchange_name = 'IFED' THEN 'IFED'
            WHEN exchange_name = 'IPE' THEN 'IFED'
            ELSE NULL
        END AS exchange_name_cleaned

        -- buy_sell
        ,CASE
            WHEN buy_sell::INT = 1 THEN 'B'
            WHEN buy_sell::INT = 2 THEN 'S'
            ELSE NULL
        END AS buy_sell_cleaned

        -- quantity
        ,CASE
            WHEN buy_sell::INT = 1 THEN quantity
            WHEN buy_sell::INT = 2 THEN -1 * quantity
            ELSE NULL
        END AS quantity_cleaned

        -- account_number
        ,CASE
          WHEN account_number = 'GHELI' THEN 'HELIOS'
          ELSE account_number
        END AS account_number_cleaned

  FROM TRADES
),

-- SELECT * FROM ADDITIONAL_COLS
-- ORDER BY sftp_date DESC, sftp_upload_timestamp DESC

-----------------------------------------------------------
-- futures_contract_month_code
-----------------------------------------------------------

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

TRADES_WITH_FUTURES_CODES AS (
    SELECT
        *

        -- futures_month_code
        ,(SELECT contract_code FROM futures_month_lookup WHERE month_number = contract_month) as futures_contract_month
        ,CONCAT((SELECT contract_code FROM futures_month_lookup WHERE month_number = contract_month), RIGHT(contract_year::VARCHAR, 1)) as futures_contract_month_y
        ,CONCAT((SELECT contract_code FROM futures_month_lookup WHERE month_number = contract_month), RIGHT(contract_year::VARCHAR, 2)) as futures_contract_month_yy

    FROM TRADES_WITH_ADDITIONAL_COLS
),

-- SELECT * FROM TRADES_WITH_FUTURES_CODES
-- ORDER BY sftp_date DESC, sftp_upload_timestamp DESC

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

TRADES_WITH_ACCOUNT_NAMES AS (
    SELECT
        trades.*

        -- account_name
        ,lookup.account_name as account_name

    FROM TRADES_WITH_FUTURES_CODES trades
    LEFT JOIN ACCOUNTS_LOOKUP_TABLE lookup ON trades.give_in_out_firm_num = lookup.account
)

SELECT * FROM TRADES_WITH_ACCOUNT_NAMES
ORDER BY sftp_date DESC, sftp_upload_timestamp DESC
