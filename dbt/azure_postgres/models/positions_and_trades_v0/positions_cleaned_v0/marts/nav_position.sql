{{
  config(
    materialized='ephemeral',
    unique_key='sftp_date',
    incremental_strategy='delete+insert'
  )
}}

-------------------------------------------------------------
-------------------------------------------------------------

WITH NAV AS (
    SELECT * FROM {{ ref('staging_v6_nav_positions') }}
    {% if is_incremental() %}
    WHERE sftp_date >= (SELECT MAX(sftp_date) - INTERVAL '14 days' FROM {{ this }})
    {% endif %}
),

FINAL AS (
    SELECT * FROM NAV
)

SELECT * FROM FINAL

ORDER BY sftp_date desc, contract_yyyymm ASC
