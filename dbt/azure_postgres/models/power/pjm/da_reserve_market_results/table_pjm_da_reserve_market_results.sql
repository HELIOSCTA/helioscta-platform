-- Source-table DDL for pjm.da_reserve_market_results.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.orchestration.power.pjm.da_reserve_market_results.

CREATE TABLE IF NOT EXISTS pjm.da_reserve_market_results (
    as_mw DOUBLE PRECISION,
    as_req_mw DOUBLE PRECISION,
    datetime_beginning_ept TIMESTAMP,
    datetime_beginning_utc TIMESTAMP NOT NULL,
    dsr_as_mw DOUBLE PRECISION,
    ircmwt2 DOUBLE PRECISION,
    locale VARCHAR NOT NULL,
    mcp DOUBLE PRECISION,
    mcp_capped DOUBLE PRECISION,
    nsr_mw DOUBLE PRECISION,
    service VARCHAR NOT NULL,
    ss_mw DOUBLE PRECISION,
    total_mw DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc,
        locale,
        service
    )
);
