{% docs natgas_mart_genscape_noms %}
Business-ready enriched gas nomination view. Combines raw nominations with pipeline,
location, cycle, and no-notice data into a single denormalized view for downstream analytics.

**Grain:** One row per gas_day, location_role_id, cycle_code
**Schema:** `natgas_cleaned`
**Consumers:** Trading analytics, nomination dashboards
{% enddocs %}

{% docs natgas_mart_lng_facilities %}
Business-ready LNG terminal nomination flows. Shows daily nomination volumes per LNG
export facility with multi-pipeline aggregation for Cameron, Freeport, and Sabine.
Includes a GENSCAPE_LNG total row summing all plants.

**Grain:** One row per gas_day, lng_plant, facility, role
**Schema:** `natgas_cleaned`
**Consumers:** LNG export analytics, facility flow monitoring
{% enddocs %}

{% docs natgas_mart_salt_facilities_bcf %}
Daily aggregated salt cavern storage flows in BCF (billion cubic feet). Pivots individual
facility flows into columns and provides regional subtotals (TX, LA, MS, AL).

**Grain:** One row per gas_day
**Schema:** `natgas_cleaned`
**Consumers:** Storage analytics, regional flow monitoring
{% enddocs %}

{% docs natgas_mart_salt_inventories %}
Daily salt cavern storage inventory levels by facility. Shows inventory, delta (change),
daily flows, and capacity metrics (available, operational, design) for each tracked facility.

**Grain:** One row per gas_day
**Schema:** `natgas_cleaned`
**Consumers:** Storage inventory analytics, capacity monitoring
{% enddocs %}
