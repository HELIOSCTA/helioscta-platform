with grouped_latest as (
    select * from {{ ref('nav_v3_excel_30_positions_grouped_latest') }}
),

FINAL as (
    select
        sftp_date as "SFTP Date",
        previous_sftp_date as "Previous SFTP Date",
        null::date as "Expiration",
        null::numeric as "DTE",
        exchange_code as "Exchange Code",
        exchange_code_grouping as "Grouping",
        exchange_code_region as "Region",
        left(contract_yyyymm, 4) || '-' || right(contract_yyyymm, 2) as "YYYYMM",
        marex_description as "MAREX Description",
        ice_xl_symbol as "ICE XL",
        lots as "ICE Lots",
        qty_total as "QTY",
        dod_qty_total as "DoD QTY",
        qty_acim as "ACIM",
        qty_pnt as "PNT",
        qty_dickson as "DICKSON",
        qty_titan as "TITAN",
        round(settlement_price_total::numeric, 3) as "MAREX Settle",
        round(previous_settlement_price_total::numeric, 3) as "Previous MAREX Settle",
        round(daily_change_total::numeric, 3) as "Change between Settles",
        round(daily_pnl_total::numeric, 0) as "PnL from Settles"
    from grouped_latest
    where exchange_code_grouping in ('POWER_FUTURES', 'POWER_OPTIONS', 'BASIS')
      and exchange_code not in ('PDA')
)

select *
from FINAL
order by
    "SFTP Date" desc,
    case "Grouping"
        when 'POWER_OPTIONS' then 1
        when 'POWER_FUTURES' then 2
        when 'BASIS' then 3
        else 999
    end,
    case "Region"
        when 'PJM' then 1
        when 'ERCOT' then 2
        when 'BASIS' then 3
        else 999
    end,
    case "Exchange Code"
        when 'PMI' then 1
        when 'OPJ' then 2
        when 'ERN' then 3
        when 'ECI' then 4
        else 999
    end,
    "YYYYMM",
    "DTE"
