{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- ERCOT Short-Term System Adequacy capacity availability values.
-- Grain: source contract from ercot.short_term_system_adequacy; primary key posteddatetime, deliverydate, hourending, repeathourflag.
---------------------------

SELECT
    posteddatetime
    ,deliverydate
    ,hourending
    ,capgenressouth
    ,capgenresnorth
    ,capgenreswest
    ,capgenreshouston
    ,caploadressouth
    ,caploadresnorth
    ,caploadreswest
    ,caploadreshouston
    ,offavailmwsouth
    ,offavailmwnorth
    ,offavailmwwest
    ,offavailmwhouston
    ,availcapgen
    ,availcapres
    ,capgenres
    ,caploadres
    ,offavailmw
    ,capregup
    ,capregdn
    ,caprrs
    ,capecrs
    ,capnspin
    ,capreguprrs
    ,capreguprrsecrs
    ,capreguprrsecrsnspin
    ,repeathourflag
    ,updated_at
FROM "{{ target.database }}"."ercot"."short_term_system_adequacy"
WHERE
    deliverydate >= '2010-01-01'::date
