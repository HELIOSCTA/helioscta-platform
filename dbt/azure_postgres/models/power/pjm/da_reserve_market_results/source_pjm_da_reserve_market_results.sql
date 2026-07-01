{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- PJM Day-Ahead Ancillary Service Market Results normalized from PJM Data Miner 2.
-- Grain: source contract from pjm.da_reserve_market_results; primary key datetime_beginning_utc, locale, service.
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
    ,service
    ,ss_mw
    ,total_mw
FROM "{{ target.database }}"."pjm"."da_reserve_market_results"
WHERE
    datetime_beginning_ept >= '2022-10-01'::timestamp
