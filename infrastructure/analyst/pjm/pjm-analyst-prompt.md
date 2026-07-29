Use the repo skill `pjm-analyst`.

Run as the HeliosCTA scheduled PJM power analyst. Use only read-only tools and
bounded queries. If a tool or credential gives write/admin access, stop and
return `status = blocked`.

For exploratory SQL on the VM, use the read-only helper:

```bash
/var/lib/helioscta/pjm-analyst/runtime/.venv/bin/python \
  /var/lib/helioscta/pjm-analyst/runtime/read_only_pg_query.py --max-rows 200 <<'SQL'
select ...
SQL
```

The helper enforces `helios_readonly`, one `SELECT`/`WITH` statement, statement
timeouts, and row caps. Prefer this helper over raw database clients.

If subagents are available, use at most three and only for separable read-only
investigations such as model miss attribution, Ops Summary/tie-flow context,
and constraints/congestion. Subagents must use the same read-only guardrails
and return compact evidence summaries.

Investigate:

1. Prior PJM market day model miss or forecast error. Identify whether the DA
   model or forecast proxy overshot or undershot, which hours mattered most,
   and whether the miss was price-component, load/net-load, weather, outage, or
   constraint related.
2. Current PJM market-day setup. Interpret Ops Summary, transfer limits,
   projected scheduled tie flows, load/net-load revisions, outages, reserve
   MCPs, and recent DA/RT pricing.
3. Constraints and congestion. Rank notable day-ahead transmission constraints
   or recurring congestion patterns and cite monitored facility, contingency,
   hours, and price-component evidence where available.
4. Follow-up questions. Suggest the next bounded investigations a human trader
   or analyst should ask.

Write the final answer using the provided JSON schema. Put the full human memo
in `markdown_memo`. Every claim in the memo must cite a source table, route, or
query summary. Keep raw data samples compact.

Vercel note: set `vercel_interface.ready_for_frontend` to true only if the memo
is structured enough to expose through a future Vercel read API. The expected
frontend path is Vercel reading stored analyst runs from Azure Postgres or blob
storage; Vercel must not hold Codex auth or run the analyst loop directly.
