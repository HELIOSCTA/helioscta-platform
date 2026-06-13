-- Source-table DDL for ercot.short_term_system_adequacy.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.ercot.short_term_system_adequacy.

CREATE TABLE IF NOT EXISTS ercot.short_term_system_adequacy (
    posteddatetime TIMESTAMP NOT NULL,
    deliverydate DATE NOT NULL,
    hourending INTEGER NOT NULL,
    capgenressouth DOUBLE PRECISION,
    capgenresnorth DOUBLE PRECISION,
    capgenreswest DOUBLE PRECISION,
    capgenreshouston DOUBLE PRECISION,
    caploadressouth DOUBLE PRECISION,
    caploadresnorth DOUBLE PRECISION,
    caploadreswest DOUBLE PRECISION,
    caploadreshouston DOUBLE PRECISION,
    offavailmwsouth DOUBLE PRECISION,
    offavailmwnorth DOUBLE PRECISION,
    offavailmwwest DOUBLE PRECISION,
    offavailmwhouston DOUBLE PRECISION,
    availcapgen DOUBLE PRECISION,
    availcapres DOUBLE PRECISION,
    capgenres DOUBLE PRECISION,
    caploadres DOUBLE PRECISION,
    offavailmw DOUBLE PRECISION,
    capregup DOUBLE PRECISION,
    capregdn DOUBLE PRECISION,
    caprrs DOUBLE PRECISION,
    capecrs DOUBLE PRECISION,
    capnspin DOUBLE PRECISION,
    capreguprrs DOUBLE PRECISION,
    capreguprrsecrs DOUBLE PRECISION,
    capreguprrsecrsnspin DOUBLE PRECISION,
    repeathourflag BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        posteddatetime,
        deliverydate,
        hourending,
        repeathourflag
    )
);
