{% docs salts_overview %}

## Salts Domain Overview

The salts domain transforms Wood Mackenzie / Genscape NatGas DataFeed rows from
Azure SQL Server database `GenscapeDataFeed` into salt cavern storage views.

### Source Contract

- **Source system:** Wood Mackenzie / Genscape NatGas DataFeed.
- **Raw schema:** `natgas`.
- **Raw tables:** `nominations`, `nomination_cycles`, `no_notice`,
  `location_role`, `location_extended`, `pipelines`.
- **Source grain:** `gas_day x location_role_id x cycle_code` for
  nominations, enriched through `source_v1_genscape_noms`.
- **Freshness field:** `gas_day`.
- **Output schema:** `salts`.
- **Consumers:** Salts frontend page, wx-adjusted scrape plots, inventory views,
  and future salts regression workflows.

### Model Path

```
natgas.* raw tables
  |
  v
models/salts/source/source_v1_genscape_noms.sql
  |
  v
models/salts/source/ (EPHEMERAL lookup tables)
  |
  v
models/salts/staging/ (EPHEMERAL salts facility rows)
  |
  v
models/salts/marts/ (VIEW outputs in salts schema)
```

{% enddocs %}
