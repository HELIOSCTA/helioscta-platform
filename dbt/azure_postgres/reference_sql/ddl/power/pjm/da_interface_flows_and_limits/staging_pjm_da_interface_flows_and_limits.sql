{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Day Ahead Interface Flows and Limits.
-- Grain: source contract from pjm.da_interface_flows_and_limits; primary key datetime_beginning_utc, interface_limit_name.
---------------------------

SELECT
    datetime_beginning_ept
    ,datetime_beginning_utc
    ,flow_mw
    ,interface_limit_name
    ,limit_mw
FROM {{ ref('source_pjm_da_interface_flows_and_limits') }}
