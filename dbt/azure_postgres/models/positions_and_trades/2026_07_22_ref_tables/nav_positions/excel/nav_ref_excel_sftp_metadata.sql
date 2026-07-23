with positions as (
    select * from {{ ref('nav_ref_00_src_positions') }}
),

latest_nav_date_by_fund as (
    select
        fund_code,
        max(nav_date)::date as sftp_date
    from positions
    group by fund_code
),

metadata as (
    select
        case
            when lower(positions.fund_code) = 'agr' then 'NAV - ACIM'
            when lower(positions.fund_code) = 'pnt' then 'NAV - PNT'
            when lower(positions.fund_code) = 'moross' then 'NAV - DICKSON'
            when lower(positions.fund_code) = 'titan' then 'NAV - TITAN'
            else 'NAV - ' || upper(positions.fund_code)
        end as source,
        latest_nav_date_by_fund.sftp_date,
        max(positions.sftp_upload_timestamp) as sftp_upload_timestamp
    from positions
    inner join latest_nav_date_by_fund
        on latest_nav_date_by_fund.fund_code = positions.fund_code
       and latest_nav_date_by_fund.sftp_date = positions.nav_date::date
    group by positions.fund_code, latest_nav_date_by_fund.sftp_date
),

FINAL as (
    select * from metadata
)

select *
from FINAL
order by source
