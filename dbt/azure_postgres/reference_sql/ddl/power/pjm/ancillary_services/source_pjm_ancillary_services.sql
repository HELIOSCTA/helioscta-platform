{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Real-Time Ancillary Service Hourly LMPs normalized from PJM Data Miner 2.
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
FROM "{{ target.database }}"."pjm"."ancillary_services"
WHERE
    datetime_beginning_ept >= '2014-01-01'::timestamp
