with positions as (
    select * from {{ ref('nav_v3_40_positions_all_history') }}
),

product_aliases as (
    select * from {{ ref('utils_v3_positions_and_trades_product_aliases') }}
    where source = 'nav'
),

month_codes as (
    select * from {{ ref('utils_v3_positions_and_trades_month_codes') }}
),

latest_upload_by_fund_date as (
    select
        fund_code,
        nav_date,
        max(sftp_upload_timestamp) as sftp_upload_timestamp
    from positions
    group by fund_code, nav_date
),

latest_upload_positions as (
    select
        positions.*,
        (
            upper(coalesce(positions.call_put, '')) in ('CALL', 'PUT', 'C', 'P')
            or upper(coalesce(positions.type, '')) like '%OPTION%'
        ) as is_option
    from positions
    inner join latest_upload_by_fund_date
        on latest_upload_by_fund_date.fund_code = positions.fund_code
       and latest_upload_by_fund_date.nav_date = positions.nav_date
       and latest_upload_by_fund_date.sftp_upload_timestamp = positions.sftp_upload_timestamp
),

normalized as (
    select
        latest_upload_positions.nav_date::date as sftp_date,
        latest_upload_positions.account_name::varchar as account_name,
        coalesce(
            latest_upload_positions.default_exchange_name,
            case
                when trim(coalesce(latest_upload_positions.exchange_name, '')) = 'NYM' then 'NYME'
                when trim(coalesce(latest_upload_positions.exchange_name, '')) <> '' then 'IFED'
            end
        )::varchar as exchange_name,
        latest_upload_positions.product_code::varchar as exchange_code,
        case
            when latest_upload_positions.is_option and latest_upload_positions.product_code = 'PMI' then 'POWER_OPTIONS'
            when latest_upload_positions.product_code in ('PDP', 'PWA', 'DDP') then 'SHORT_TERM_POWER_RT'
            when latest_upload_positions.product_code = 'HHD' then 'BALMO'
            when latest_upload_positions.product_family = 'Basis' then 'BASIS'
            when latest_upload_positions.product_family = 'Gas'
                and latest_upload_positions.is_option
            then 'GAS_OPTIONS'
            when latest_upload_positions.product_family = 'Gas' then 'GAS_FUTURES'
            when latest_upload_positions.product_code = 'P1X'
                or (
                    latest_upload_positions.product_family = 'Power'
                    and latest_upload_positions.is_option
                )
            then 'POWER_OPTIONS'
            when latest_upload_positions.product_code in ('ERA', 'END', 'NEZ', 'SDP') then 'SHORT_TERM_POWER'
            when latest_upload_positions.product_family = 'Power' then 'POWER_FUTURES'
        end::varchar as exchange_code_grouping,
        case
            when latest_upload_positions.product_family = 'Gas' then 'HENRY_HUB'
            when latest_upload_positions.product_family = 'Basis' then 'BASIS'
            when latest_upload_positions.market_name = 'Mid-C' then 'PAC_NW'
            else upper(latest_upload_positions.market_name)
        end::varchar as exchange_code_region,
        latest_upload_positions.is_option::boolean as is_option,
        latest_upload_positions.put_call_code::varchar as put_call,
        case
            when latest_upload_positions.is_option then latest_upload_positions.strike_price_normalized
        end::double precision as strike_price,
        latest_upload_positions.contract_yyyymm::varchar as contract_yyyymm,
        case
            when latest_upload_positions.contract_yyyymm is not null
                and latest_upload_positions.contract_day is not null
            then to_date(
                latest_upload_positions.contract_yyyymm
                || lpad(latest_upload_positions.contract_day::text, 2, '0'),
                'YYYYMMDD'
            )
        end as contract_yyyymmdd,
        latest_upload_positions.contract_day::integer as contract_day,
        product_aliases.marex_product::varchar as marex_product,
        latest_upload_positions.quantity_1::double precision as qty,
        latest_upload_positions.multiplier_and_tick_value::double precision as lots,
        latest_upload_positions.market_settlement_price::double precision as settlement_price,
        latest_upload_positions.trade_price::double precision as trade_price,
        month_codes.month_code::varchar as month_code,
        latest_upload_positions.bbg_exchange_code::varchar as bbg_exchange_code
    from latest_upload_positions
    left join product_aliases
        on product_aliases.source_priority = latest_upload_positions.rule_priority
       and product_aliases.match_type = latest_upload_positions.rule_match_type
       and product_aliases.pattern = latest_upload_positions.rule_pattern
       and product_aliases.product_code = latest_upload_positions.product_code
    left join month_codes
        on month_codes.month_number = case
            when latest_upload_positions.contract_yyyymm is not null
            then right(latest_upload_positions.contract_yyyymm, 2)::integer
        end
),

FINAL as (
    select
        sftp_date,
        account_name,
        exchange_name,
        exchange_code_grouping,
        exchange_code_region,
        exchange_code,
        is_option,
        put_call,
        strike_price,
        contract_yyyymm,
        contract_yyyymmdd,
        contract_day,
        marex_product,
        qty,
        case
            when lots = 2500
                and exchange_code in ('HHD', 'H', 'PHH', 'PHE')
            then qty / 4
            else qty
        end as gas_qty,
        lots,
        case
            when lots = 2500
                and exchange_code in ('HHD', 'H', 'PHH', 'PHE')
            then lots * 4
            else lots
        end as gas_lots,
        settlement_price,
        trade_price,
        case
            when month_code is not null
                and contract_yyyymm is not null
            then month_code || right(left(contract_yyyymm, 4), 1)
        end::varchar as futures_contract_month_y,
        case
            when month_code is not null
                and contract_yyyymm is not null
            then month_code || right(left(contract_yyyymm, 4), 2)
        end::varchar as futures_contract_month_yy,
        bbg_exchange_code
    from normalized
)

select *
from FINAL
order by
    sftp_date desc,
    contract_yyyymm,
    contract_yyyymmdd,
    account_name,
    exchange_code
