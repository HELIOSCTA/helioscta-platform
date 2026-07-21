# NAV Freshness Precheck

Use this reference for scheduled product-matching runs before starting dbt.
Prefer the read-only MCP database tool:

```text
mcp__heliosctadb_helios_prod_helios_readonly.query
```

Do not use the admin database MCP connection for this precheck.

## Expected NAV date query

This query computes the previous business NAV date from the current
`America/Denver` date, then compares it with `nav.positions`.

```sql
with run_clock as (
    select (now() at time zone 'America/Denver')::date as current_mountain_date
),

expected as (
    select
        current_mountain_date,
        case extract(isodow from current_mountain_date)::int
            when 1 then current_mountain_date - interval '3 days'
            when 7 then current_mountain_date - interval '2 days'
            when 6 then current_mountain_date - interval '1 day'
            else current_mountain_date - interval '1 day'
        end::date as expected_nav_date
    from run_clock
),

overall as (
    select
        max(nav_date)::date as latest_nav_date,
        max(created_at) as latest_created_at
    from nav.positions
),

expected_rows as (
    select positions.*
    from nav.positions as positions
    inner join expected
        on positions.nav_date = expected.expected_nav_date
)

select
    expected.current_mountain_date,
    expected.expected_nav_date,
    overall.latest_nav_date,
    count(expected_rows.*) as expected_nav_row_count,
    count(distinct expected_rows.fund_code) as expected_nav_fund_count,
    array_remove(array_agg(distinct expected_rows.fund_code order by expected_rows.fund_code), null) as expected_nav_fund_codes,
    (max(expected_rows.created_at) at time zone 'America/Denver') as expected_latest_created_at_mountain,
    (overall.latest_created_at at time zone 'America/Denver') as overall_latest_created_at_mountain
from expected
cross join overall
left join expected_rows on true
group by
    expected.current_mountain_date,
    expected.expected_nav_date,
    overall.latest_nav_date,
    overall.latest_created_at;
```

Treat freshness as good only when:

- `latest_nav_date` is at least `expected_nav_date`
- `expected_nav_row_count` is greater than `0`
- `expected_nav_fund_count` is at least the selected fund count, normally `4`

If freshness is not good, report `Product-matching dbt heartbeat pending/stale`
and stop before running dbt.
