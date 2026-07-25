-- Excel-scoped recent NAV rows selected from the canonical all-history contract.

with positions as (
    select * from {{ ref('nav_ref_40_positions_all_history') }}
),

latest_nav_dates as (
    select nav_date
    from (
        select distinct positions.nav_date::date as nav_date
        from positions
        where positions.nav_date is not null
        order by positions.nav_date::date desc
        limit 2
    ) as recent_dates
),

recent_positions as (
    select positions.*
    from positions
    inner join latest_nav_dates
        on latest_nav_dates.nav_date = positions.nav_date::date
),

latest_upload_by_fund_date as (
    select
        recent_positions.fund_code,
        recent_positions.nav_date,
        max(recent_positions.sftp_upload_timestamp) as sftp_upload_timestamp
    from recent_positions
    group by
        recent_positions.fund_code,
        recent_positions.nav_date
),

FINAL as (
    select recent_positions.*
    from recent_positions
    inner join latest_upload_by_fund_date
        on latest_upload_by_fund_date.fund_code = recent_positions.fund_code
       and latest_upload_by_fund_date.nav_date = recent_positions.nav_date
       and latest_upload_by_fund_date.sftp_upload_timestamp = recent_positions.sftp_upload_timestamp
)

select *
from FINAL
