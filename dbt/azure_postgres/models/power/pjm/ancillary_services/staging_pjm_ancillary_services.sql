{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Real-Time Ancillary Service Hourly LMPs.
-- Grain: source contract from pjm.ancillary_services; primary key datetime_beginning_utc, datetime_beginning_ept, ancillary_service, row_is_current, version_nbr.
---------------------------

SELECT
    ancillary_service
    ,datetime_beginning_ept
    ,datetime_beginning_utc
    ,row_is_current
    ,unit
    ,value
    ,version_nbr
FROM {{ ref('source_pjm_ancillary_services') }}
