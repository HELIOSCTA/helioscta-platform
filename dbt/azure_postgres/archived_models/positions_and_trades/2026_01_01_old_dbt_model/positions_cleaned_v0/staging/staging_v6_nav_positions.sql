{{
  config(
    materialized='ephemeral'
  )
}}

-------------------------------------------------------------
-- materialized='ephemeral'
-------------------------------------------------------------

WITH NAV AS (
    SELECT * FROM {{ ref('staging_v6_nav_positions_4_exchange_codes') }}
),

FINAL AS (
    SELECT * FROM NAV
)

SELECT * FROM FINAL

ORDER BY sftp_date desc, contract_yyyymm ASC
