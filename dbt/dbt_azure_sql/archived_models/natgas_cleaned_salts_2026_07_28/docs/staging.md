{% docs natgas_staging_lng_facilities %}
Staging model for LNG terminal nomination data. Aggregates nominations by LNG plant,
handles multi-pipeline facilities (Cameron, Freeport, Sabine) by summing across
contributing location_role_ids. Produces a `GENSCAPE_LNG` total row aggregating all plants.

**Grain:** One row per gas_day, lng_plant, facility, role, cycle
**Key transforms:** Multi-pipeline facility aggregation, GENSCAPE_LNG total row
{% enddocs %}

{% docs natgas_staging_salts_noms %}
Staging model for salt cavern storage nomination flows. Joins enriched nominations
(`source_v1_genscape_noms`) with the SALTS reference lookup table to map location_role_ids
to named storage facilities and compute signed scheduled capacity using facility-specific
flow signs.

**Grain:** One row per gas_day, storage_facility, location_role_id, cycle
**Key transforms:** Storage facility name lookup, signed capacity calculation
{% enddocs %}

{% docs natgas_staging_salts_inventories %}
Staging model for salt cavern storage inventory metrics. Joins enriched nominations
with the inventory-specific reference lookup to map location_role_ids to storage facilities
with inventory, change_inventory, injection, withdrawal, and net facility withdrawal roles.

**Grain:** One row per gas_day, storage_facility, role, cycle
**Key transforms:** Inventory role lookup, signed capacity calculation
{% enddocs %}
