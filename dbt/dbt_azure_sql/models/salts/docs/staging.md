{% docs salts_staging_salts_noms %}
Staging model for salt cavern storage nomination flows. Joins enriched NatGas
nominations with the salts flow lookup table to map location_role_ids to named
storage facilities and compute storage-signed scheduled capacity.

**Source system:** Wood Mackenzie / Genscape NatGas DataFeed
**Raw source:** `GenscapeDataFeed.natgas.nominations`
**Grain:** One row per gas_day, storage_facility_name, location_role_id, cycle_code
{% enddocs %}

{% docs salts_staging_salts_inventories %}
Staging model for salt cavern storage inventory metrics. Joins enriched NatGas
nominations with the salts inventory lookup table to map inventory, change,
injection, withdrawal, and net facility withdrawal roles.

**Source system:** Wood Mackenzie / Genscape NatGas DataFeed
**Raw source:** `GenscapeDataFeed.natgas.nominations`
**Grain:** One row per gas_day, storage_facility_name, role, location_role_id, cycle_code
{% enddocs %}
