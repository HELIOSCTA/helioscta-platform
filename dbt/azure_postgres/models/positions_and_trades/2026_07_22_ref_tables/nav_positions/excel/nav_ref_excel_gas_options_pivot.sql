with grouped_latest as (
    select * from {{ ref('nav_ref_excel_30_positions_grouped_latest') }}
),

combined as (
    select
        left(contract_yyyymm, 4) || '-' || right(contract_yyyymm, 2) as "YYYYMM",
        futures_contract_month_y as "Futures Contract Code",
        exchange_code as "Exchange Code",
        put_call as "P/C",
        strike_price as "Strike",
        bbg_option_description as "Option Description",
        qty_acim as "ACIM",
        qty_pnt as "PNT",
        qty_dickson as "DICKSON",
        qty_titan as "TITAN",
        qty_total as "QTY",
        round(settlement_price_total::numeric, 3) as "MAREX Settle",
        round(previous_settlement_price_total::numeric, 3) as "Previous MAREX Settle"
    from grouped_latest
    where exchange_code_grouping in ('GAS_OPTIONS')
      and exchange_code in ('LN', 'PHE')
),

FINAL as (
    select
        "YYYYMM",
        "Futures Contract Code",
        "Exchange Code",
        "P/C",
        "Strike",
        "Option Description",
        sum("ACIM") as "ACIM",
        sum("PNT") as "PNT",
        sum("DICKSON") as "DICKSON",
        sum("TITAN") as "TITAN",
        sum("QTY") as "QTY",
        max("MAREX Settle") as "MAREX Settle",
        max("Previous MAREX Settle") as "Previous MAREX Settle"
    from combined
    group by
        "YYYYMM",
        "Futures Contract Code",
        "Exchange Code",
        "P/C",
        "Strike",
        "Option Description"
)

select *
from FINAL
order by
    "YYYYMM",
    "Strike",
    "P/C"
