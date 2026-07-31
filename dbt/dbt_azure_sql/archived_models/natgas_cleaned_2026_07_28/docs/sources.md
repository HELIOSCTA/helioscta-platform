{% docs natgas_source_nominations %}
Raw gas nomination records from the WM NatGas DataFeed. Each row represents a nomination
for a specific location_role_id on a gas_day with a given cycle_code. Contains scheduled,
operational, available, and design capacity values.

**Primary key:** `(gas_day, location_role_id, cycle_code)`
**Schema:** `natgas`
**Ingestion:** Hourly delta via `gasdatafeed_import.ps1`
{% enddocs %}

{% docs natgas_source_nomination_cycles %}
Reference table mapping cycle_code to cycle name and metadata.
Used to enrich nomination records with human-readable cycle names.

**Ingestion:** Metadata refresh via `gasdatafeed_import.ps1`
{% enddocs %}

{% docs natgas_source_no_notice %}
Intra-day no-notice capacity transactions by location_role_id and gas_day.
Joined to nominations to add no_notice_capacity values.

**Primary key:** `(gas_day, location_role_id)`
**Ingestion:** Hourly delta via `gasdatafeed_import.ps1`
{% enddocs %}

{% docs natgas_source_location_role %}
Maps location_role_id to location_id, role, role_code, meter, DRN, sign, and storage flags.
Core reference table for enriching nominations with role and flow direction.

**Primary key:** `location_role_id`
**Ingestion:** Metadata refresh via `gasdatafeed_import.ps1`
{% enddocs %}

{% docs natgas_source_location_extended %}
Extended location details including pipeline_id, tariff_zone, timezone, state, county,
loc_name, facility type, coordinates, and interconnecting entity.

**Primary key:** `location_id`
**Ingestion:** Metadata refresh via `gasdatafeed_import.ps1`
{% enddocs %}

{% docs natgas_source_pipelines %}
Pipeline reference data including pipeline_id, name, short_name, and FERC 720 reporting flag.

**Primary key:** `pipeline_id`
**Ingestion:** Metadata refresh via `gasdatafeed_import.ps1`
{% enddocs %}
