{{
  config(
    materialized='ephemeral'
  )
}}

SELECT
    posteddatetime AS posted_datetime,
    deliverydate AS delivery_date,
    hourending,
    repeathourflag AS repeat_hour_flag,
    capgenressouth AS gen_resource_capacity_south_mw,
    capgenresnorth AS gen_resource_capacity_north_mw,
    capgenreswest AS gen_resource_capacity_west_mw,
    capgenreshouston AS gen_resource_capacity_houston_mw,
    caploadressouth AS load_resource_capacity_south_mw,
    caploadresnorth AS load_resource_capacity_north_mw,
    caploadreswest AS load_resource_capacity_west_mw,
    caploadreshouston AS load_resource_capacity_houston_mw,
    offavailmwsouth AS offline_available_south_mw,
    offavailmwnorth AS offline_available_north_mw,
    offavailmwwest AS offline_available_west_mw,
    offavailmwhouston AS offline_available_houston_mw,
    availcapgen AS available_generation_capacity_mw,
    availcapres AS available_resource_capacity_mw,
    capgenres AS generation_resource_capacity_mw,
    caploadres AS load_resource_capacity_mw,
    offavailmw AS offline_available_mw,
    capregup AS regup_capacity_mw,
    capregdn AS regdn_capacity_mw,
    caprrs AS rrs_capacity_mw,
    capecrs AS ecrs_capacity_mw,
    capnspin AS nspin_capacity_mw,
    capreguprrs AS regup_rrs_capacity_mw,
    capreguprrsecrs AS regup_rrs_ecrs_capacity_mw,
    capreguprrsecrsnspin AS regup_rrs_ecrs_nspin_capacity_mw,
    updated_at
FROM {{ ref('source_ercot_short_term_system_adequacy') }}
