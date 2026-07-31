{% docs salts_mart_facilities_bcf %}
Daily aggregated salt cavern storage flows in BCF. Pivots tracked facility
flows into columns and provides South Central salt regional subtotals for TX,
LA, MS, and AL.

**Source system:** Wood Mackenzie / Genscape NatGas DataFeed
**Output schema:** `salts`
**View:** `marts_v1_salt_facilities_bcf`
**Grain:** One row per gas_day
**Freshness field:** gas_day
**Consumers:** Salts frontend Wx Adj Scrapes tab, storage analytics
{% enddocs %}

{% docs salts_mart_inventories %}
Daily salt cavern storage inventory levels by facility. Shows inventory,
inventory delta, daily flows, and capacity metrics for tracked salt facilities.

**Source system:** Wood Mackenzie / Genscape NatGas DataFeed
**Output schema:** `salts`
**View:** `marts_v1_salt_inventories`
**Grain:** One row per gas_day
**Freshness field:** gas_day
**Consumers:** Salts frontend Inventories tab, storage analytics
{% enddocs %}
