{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Real-Time Ancillary Service Market Results normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.reserve_market_results; primary key datetime_beginning_utc, locale, service.
---------------------------

SELECT
    as_mw
    ,as_req_mw
    ,datetime_beginning_ept
    ,datetime_beginning_utc
    ,dsr_as_mw
    ,ircmwt2
    ,locale
    ,mcp
    ,mcp_capped
    ,nsr_mw
    ,reg_ccp
    ,reg_pcp
    ,regd_mw
    ,service
    ,ss_mw
    ,tier1_mw
    ,total_mw
FROM "{{ target.database }}"."pjm"."reserve_market_results"
WHERE
    datetime_beginning_ept >= '2014-01-01'::timestamp
