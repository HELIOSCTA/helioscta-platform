with positions as (
    select * from {{ ref('nav_30_int_rules') }}
),

latest_nav_by_fund as (
    select
        fund_code,
        max(nav_date) as nav_date
    from positions
    group by fund_code
),

latest_upload_by_fund as (
    select
        positions.fund_code,
        positions.nav_date,
        max(positions.sftp_upload_timestamp) as sftp_upload_timestamp
    from positions
    inner join latest_nav_by_fund
        on latest_nav_by_fund.fund_code = positions.fund_code
       and latest_nav_by_fund.nav_date = positions.nav_date
    group by positions.fund_code, positions.nav_date
),

FINAL as (
    select positions.*
    from positions
    inner join latest_upload_by_fund
        on latest_upload_by_fund.fund_code = positions.fund_code
       and latest_upload_by_fund.nav_date = positions.nav_date
       and latest_upload_by_fund.sftp_upload_timestamp = positions.sftp_upload_timestamp
)

select *
from FINAL
order by
    nav_date desc,
    sftp_upload_timestamp desc,
    fund_code,
    account_group,
    account,
    product_code,
    contract_yyyymm,
    contract_day
