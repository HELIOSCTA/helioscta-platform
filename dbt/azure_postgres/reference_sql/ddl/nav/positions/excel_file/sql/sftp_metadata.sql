-- Source workbook: nav_position_file_2026_july_21.xlsm
-- Source Power Query: SFTP_METADATA
-- Extracted from: customXml/item1.xml -> DataMashup -> Formulas/Section1.m
-- Source connection: dsn=Azure PostgreSQL

SELECT
    'NAV - ACIM' as source
    ,MAX(sftp_date) as sftp_date
    ,MAX(sftp_upload_timestamp) as sftp_upload_timestamp
from positions_cleaned_v2.nav_position_agr
WHERE sftp_date >= current_date - 5

UNION ALL

SELECT
    'NAV - PNT' as source
    ,MAX(sftp_date) as sftp_date
    ,MAX(sftp_upload_timestamp) as sftp_upload_timestamp
from positions_cleaned_v2.nav_position_pnt
WHERE sftp_date >= current_date - 5

UNION ALL

SELECT
    'NAV - DICKSON' as source
    ,MAX(sftp_date) as sftp_date
    ,MAX(sftp_upload_timestamp) as sftp_upload_timestamp
from positions_cleaned_v2.nav_position_moross
WHERE sftp_date >= current_date - 5

UNION ALL

SELECT
    'NAV - TITAN' as source
    ,MAX(sftp_date) as sftp_date
    ,MAX(sftp_upload_timestamp) as sftp_upload_timestamp
from positions_cleaned_v2.nav_position_titan
WHERE sftp_date >= current_date - 5
