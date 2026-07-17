-------------------------------------------------------------
-------------------------------------------------------------

WITH TRADES AS (
    SELECT * FROM {{ ref('staging_v1_clear_street_trades_2_product_codes') }}
)

SELECT * FROM TRADES
ORDER BY
  sftp_date DESC,
  sftp_upload_timestamp DESC,
  product_code_grouping,
  product_code_region
