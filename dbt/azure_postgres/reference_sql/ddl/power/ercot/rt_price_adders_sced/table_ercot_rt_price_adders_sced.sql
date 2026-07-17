-- Source-table DDL for ercot.rt_price_adders_sced.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.ercot.rt_price_adders_sced.

CREATE TABLE IF NOT EXISTS ercot.rt_price_adders_sced (
    scedtimestamp TIMESTAMP NOT NULL,
    repeathourflag BOOLEAN NOT NULL,
    systemlambda DOUBLE PRECISION,
    rtrdpa DOUBLE PRECISION,
    rtrdparus DOUBLE PRECISION,
    rtrdpards DOUBLE PRECISION,
    rtrdparrs DOUBLE PRECISION,
    rtrdpaecrs DOUBLE PRECISION,
    rtrdpanss DOUBLE PRECISION,
    rtrruc DOUBLE PRECISION,
    rtrrmr DOUBLE PRECISION,
    rtdnclr DOUBLE PRECISION,
    rtders DOUBLE PRECISION,
    rtdctieimport DOUBLE PRECISION,
    rtdctieexport DOUBLE PRECISION,
    rtbltimport DOUBLE PRECISION,
    rtbltexport DOUBLE PRECISION,
    rtollsl DOUBLE PRECISION,
    rtolhsl DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scedtimestamp, repeathourflag)
);
