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
)

select positions.*
from positions
inner join latest_upload_by_fund
    on latest_upload_by_fund.fund_code = positions.fund_code
   and latest_upload_by_fund.nav_date = positions.nav_date
   and latest_upload_by_fund.sftp_upload_timestamp = positions.sftp_upload_timestamp
order by
    positions.nav_date desc,
    positions.sftp_upload_timestamp desc,
    positions.fund_code,
    positions.account_group,
    positions.account,
    positions.product_code,
    positions.contract_yyyymm,
    positions.contract_day
