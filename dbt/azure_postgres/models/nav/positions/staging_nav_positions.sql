WITH source AS (
    SELECT *
    FROM {{ ref('source_nav_positions') }}
)

SELECT *
FROM source
WHERE fund_code IS NOT NULL
  AND nav_date IS NOT NULL
  AND sftp_upload_timestamp IS NOT NULL
  AND source_file_name IS NOT NULL
  AND source_file_row_number IS NOT NULL
