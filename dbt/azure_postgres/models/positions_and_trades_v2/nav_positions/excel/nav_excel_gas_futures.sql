with grouped_latest as (
    select * from {{ ref('nav_excel_30_positions_grouped_latest') }}
),

FINAL as (
    select
        sftp_date as "SFTP Date",
        previous_sftp_date as "Previous SFTP Date",
        null::date as "Expiration",
        null::numeric as "DTE",
        exchange_code as "Exchange Code",
        left(contract_yyyymm, 4) || '-' || right(contract_yyyymm, 2) as "YYYYMM",
        futures_contract_month_y as "Futures Contract Code",
        marex_description as "Marex Description",
        cme_excel_symbol as "CME Symbol",
        lots as "CME Gas Lots",
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
    where exchange_code_grouping in ('GAS_FUTURES')
)

select *
from FINAL
order by
    "SFTP Date" desc,
    "YYYYMM",
    "Exchange Code",
    "DTE"
