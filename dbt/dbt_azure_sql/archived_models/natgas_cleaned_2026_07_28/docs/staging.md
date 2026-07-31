{% docs natgas_staging_lng_facilities %}
Staging model for LNG terminal nomination data. Aggregates nominations by LNG plant,
handles multi-pipeline facilities (Cameron, Freeport, Sabine) by summing across
contributing location_role_ids. Produces a `GENSCAPE_LNG` total row aggregating all plants.

**Grain:** One row per gas_day, lng_plant, facility, role, cycle
**Key transforms:** Multi-pipeline facility aggregation, GENSCAPE_LNG total row
{% enddocs %}
