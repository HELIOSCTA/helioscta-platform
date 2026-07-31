{% docs natgas_overview %}

## WM NatGas DataFeed - Domain Overview

The natgas_cleaned domain transforms raw Wood Mackenzie (Genscape) Natural Gas DataFeed data
from Azure SQL Server (`GenscapeDataFeed.natgas`) into business-ready analytical views.

### Data Sources

All raw data is ingested by the WM NatGas DataFeed PowerShell importer (`gasdatafeed_import.ps1`)
into the `natgas` schema on Azure SQL. The feed includes:

- **Nominations** -- daily gas capacity nominations by location, pipeline, and cycle
- **No-Notice** -- intra-day no-notice capacity transactions
- **Location Role** -- pipeline location-to-role mappings (shippers, receivers, meters)
- **Location Extended** -- location details (name, coordinates, county, state, timezone)
- **Pipelines** -- pipeline reference data (IDs, names, FERC 720 flag)
- **Nomination Cycles** -- scheduling cycle definitions

### Domain Hierarchy

The natgas_cleaned domain is organized into three analytical sub-domains:

1. **Nominations (Noms)** -- enriched gas nominations with pipeline, location, and cycle details
2. **LNG** -- LNG terminal nomination flows for 9 US export facilities
3. **SALTS** -- salt cavern storage facility flows and inventory metrics across TX, LA, MS, AL

### Pipeline Architecture

```
natgas.* raw tables (WM DataFeed)
  |
  v
source/ (EPHEMERAL) -- extract, cast, join reference tables
  |
  v
staging/ (EPHEMERAL) -- facility lookups, aggregation, business logic
  |
  v
marts/ (VIEW) -- business-ready outputs in natgas_cleaned schema
```

{% enddocs %}
