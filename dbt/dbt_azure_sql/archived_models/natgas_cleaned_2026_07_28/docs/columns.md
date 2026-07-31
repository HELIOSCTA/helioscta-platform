{% docs natgas_col_gas_day %}
The gas day date. In the natural gas industry, the gas day runs from 9:00 AM CT
to 9:00 AM CT the following calendar day.
{% enddocs %}

{% docs natgas_col_pipeline_id %}
Unique identifier for the pipeline in the WM NatGas DataFeed system.
{% enddocs %}

{% docs natgas_col_pipeline_name %}
Full legal name of the pipeline operator.
{% enddocs %}

{% docs natgas_col_pipeline_short_name %}
Abbreviated pipeline name used in reports and dashboards.
{% enddocs %}

{% docs natgas_col_location_id %}
Unique identifier for a physical location (meter station, interconnect, facility).
{% enddocs %}

{% docs natgas_col_location_role_id %}
Unique identifier for a specific role at a location (e.g., receipt, delivery, storage).
A single location_id may have multiple location_role_ids.
{% enddocs %}

{% docs natgas_col_facility %}
Type of facility at the location (e.g., STORAGE, LNG TERMINAL, INTERSTATE INTERCONNECT,
INTRASTATE INTERCONNECT, GAS PROCESSING PLANT, POOL POINT, GATHERING SYSTEM INTERCONNECT).
{% enddocs %}

{% docs natgas_col_role %}
The flow role at this location_role_id (e.g., RECEIPT, DELIVERY, INJECTION, WITHDRAWAL,
INVENTORY, CHANGE_INVENTORY, NET FAC WITHDRAWAL).
{% enddocs %}

{% docs natgas_col_sign %}
Flow direction sign: 1 for inflows (receipts, injections), -1 for outflows (deliveries, withdrawals).
Used to compute signed capacity values.
{% enddocs %}

{% docs natgas_col_cycle_code %}
Nomination cycle identifier code. Joined to nomination_cycles for the cycle name.
{% enddocs %}

{% docs natgas_col_cycle_name %}
Human-readable name of the nomination cycle (e.g., Timely, Evening, Intraday 1).
{% enddocs %}

{% docs natgas_col_scheduled_cap %}
Scheduled capacity in the nomination (unsigned).
{% enddocs %}

{% docs natgas_col_signed_scheduled_cap %}
Scheduled capacity multiplied by the flow sign. Positive for inflows, negative for outflows.
{% enddocs %}

{% docs natgas_col_no_notice_capacity %}
No-notice capacity value from intra-day no-notice transactions.
{% enddocs %}

{% docs natgas_col_operational_cap %}
Operational capacity at the location.
{% enddocs %}

{% docs natgas_col_available_cap %}
Available capacity at the location.
{% enddocs %}

{% docs natgas_col_design_cap %}
Design capacity at the location.
{% enddocs %}

{% docs natgas_col_lng_plant %}
Name of the LNG export facility (e.g., CALCASIEU, CAMERON, CORPUS_CHRISTI, COVE_POINT,
ELBA, FREEPORT, GOLDEN_PASS, PLAQUEMINES, SABINE). GENSCAPE_LNG represents the total
across all facilities.
{% enddocs %}

{% docs natgas_col_state %}
US state where the location resides.
{% enddocs %}

{% docs natgas_col_county %}
US county where the location resides.
{% enddocs %}

{% docs natgas_col_tariff_zone %}
Pipeline tariff zone for the location.
{% enddocs %}
