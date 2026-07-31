{{
  config(
    materialized='view',
    schema='natgas_cleaned'
  )
}}

---------------------------
-- ENRICHED GAS NOMINATIONS
---------------------------

WITH NOMS AS (
    SELECT * FROM {{ ref('source_v1_genscape_noms') }}
),

REGION_MAP AS (
    SELECT * FROM {{ ref('genscape_state_region_mapping') }}
),

---------------------------
-- FINAL
---------------------------

FINAL AS (
    SELECT
        noms.*,
        rgn.state_abb,
        rgn.country,
        rgn.eia_ng_regions,
        rgn.eia_padd_regions
    FROM NOMS noms
    LEFT JOIN REGION_MAP rgn ON noms.state = rgn.state
)

SELECT * FROM FINAL
