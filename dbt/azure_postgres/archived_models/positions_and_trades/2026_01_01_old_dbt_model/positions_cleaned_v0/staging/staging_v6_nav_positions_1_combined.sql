{{
  config(
    materialized='ephemeral'
  )
}}

-------------------------------------------------------------
-------------------------------------------------------------

WITH COMBINED AS (
    SELECT * FROM {{ ref('source_v6_nav_positions_agr') }}
    UNION ALL
    SELECT * FROM {{ ref('source_v6_nav_positions_moross') }}
    UNION ALL
    SELECT * FROM {{ ref('source_v6_nav_positions_pnt') }}
    UNION ALL
    SELECT * FROM {{ ref('source_v6_nav_positions_titan') }}
),

FINAL AS (
    SELECT * FROM COMBINED
)

SELECT * FROM FINAL

ORDER BY sftp_date desc
