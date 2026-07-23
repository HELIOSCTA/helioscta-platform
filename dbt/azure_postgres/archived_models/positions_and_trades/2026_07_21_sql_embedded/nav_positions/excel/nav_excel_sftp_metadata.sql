with positions as (
    select * from {{ ref('nav_40_positions_all_history') }}
),

metadata as (
    select
        case
            when lower(fund_code) = 'agr' then 'NAV - ACIM'
            when lower(fund_code) = 'pnt' then 'NAV - PNT'
            when lower(fund_code) = 'moross' then 'NAV - DICKSON'
            when lower(fund_code) = 'titan' then 'NAV - TITAN'
            else 'NAV - ' || upper(fund_code)
        end as source,
        max(nav_date)::date as sftp_date,
        max(sftp_upload_timestamp) as sftp_upload_timestamp
    from positions
    group by fund_code
),

FINAL as (
    select * from metadata
)

select *
from FINAL
order by source
