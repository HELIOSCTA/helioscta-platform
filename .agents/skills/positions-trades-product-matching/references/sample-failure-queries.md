# Product-Matching Failure Queries

Run these from `dbt/azure_postgres` after `.env` is loaded and Azure Postgres
connects. Do not print environment values.

## Read dbt results

```powershell
$results = Get-Content .\target\run_results.json | ConvertFrom-Json
$results.results |
  Where-Object { $_.status -ne 'pass' } |
  Select-Object unique_id,status,message,failures
```

## NAV failure groups

```powershell
dbt show --profiles-dir . --inline "
with failing_rows as (
    select *
    from {{ ref('nav_40_positions_all_history') }}
    where rule_status is distinct from 'ok'
)

select
    rule_status,
    product,
    account,
    account_name,
    month_year,
    contract_yyyymm,
    call_put,
    strike_price,
    max(nav_date) as latest_nav_date,
    count(*) as row_count
from failing_rows
group by
    rule_status,
    product,
    account,
    account_name,
    month_year,
    contract_yyyymm,
    call_put,
    strike_price
order by row_count desc, latest_nav_date desc
limit 25
"
```

## NAV representative rows

```powershell
dbt show --profiles-dir . --inline "
select
    fund_code,
    source_file_name,
    source_file_row_number,
    nav_date,
    sftp_upload_timestamp,
    account,
    account_name,
    product,
    type,
    month_year,
    client_symbol,
    strike_price,
    call_put,
    product_code,
    contract_yyyymm,
    contract_day,
    put_call_code,
    strike_price_normalized,
    rule_status,
    rule_priority,
    rule_match_type,
    rule_pattern
from {{ ref('nav_40_positions_all_history') }}
where rule_status is distinct from 'ok'
order by nav_date desc, sftp_upload_timestamp desc, product
limit 25
"
```

## Clear Street failure groups

```powershell
dbt show --profiles-dir . --inline "
with failing_rows as (
    select *
    from {{ ref('cs_65_eod_all_history') }}
    where rule_status is distinct from 'ok'
      and rule_status is distinct from 'non_product_cash_adjustment'
)

select
    rule_status,
    security_description,
    symbol,
    futures_code,
    exchange,
    account_number,
    account_name,
    contract_year_month,
    contract_yyyymm,
    put_call_code,
    strike_price_normalized,
    max(trade_date_from_sftp) as latest_trade_date,
    count(*) as row_count
from failing_rows
group by
    rule_status,
    security_description,
    symbol,
    futures_code,
    exchange,
    account_number,
    account_name,
    contract_year_month,
    contract_yyyymm,
    put_call_code,
    strike_price_normalized
order by row_count desc, latest_trade_date desc
limit 25
"
```

## Clear Street representative rows

```powershell
dbt show --profiles-dir . --inline "
select
    trade_date_from_sftp,
    sftp_date,
    sftp_upload_timestamp,
    row_number_for_trades,
    record_id,
    account_number,
    account_name,
    exchange,
    futures_code,
    symbol,
    security_description,
    trade_type,
    security_type_code,
    instr_type,
    instrument_description,
    contract_year_month,
    contract_yyyymm,
    contract_day,
    put_call_code,
    strike_price_normalized,
    product_code,
    underlying_product_code,
    rule_status,
    rule_match_source
from {{ ref('cs_65_eod_all_history') }}
where rule_status is distinct from 'ok'
  and rule_status is distinct from 'non_product_cash_adjustment'
order by trade_date_from_sftp desc, sftp_upload_timestamp desc, security_description
limit 25
"
```
