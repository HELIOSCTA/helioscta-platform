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
        latest_upload_positions.fund_code,
        latest_upload_positions.nav_date::date as sftp_date,
        latest_upload_positions.sftp_upload_timestamp::timestamp as sftp_upload_timestamp,
        'NAV'::varchar as source_table,
        latest_upload_positions.product_id_internal::varchar as reference_number,
        latest_upload_positions.account::varchar as account,
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
        case
            when latest_upload_positions.is_option then latest_upload_positions.underlying_product_code
        end::varchar as exchange_code_underlying,
        latest_upload_positions.is_option::boolean as is_option,
        latest_upload_positions.put_call_code::varchar as put_call,
        case
            when latest_upload_positions.is_option then latest_upload_positions.strike_price_normalized
        end::double precision as strike_price,
        null::numeric as marex_delta,
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
        case
            when latest_upload_positions.contract_yyyymm is not null
            then left(latest_upload_positions.contract_yyyymm, 4)::integer
        end as contract_year,
        case
            when latest_upload_positions.contract_yyyymm is not null
            then right(latest_upload_positions.contract_yyyymm, 2)::integer
        end as contract_month,
        latest_upload_positions.contract_day::integer as contract_day,
        latest_upload_positions.trade_date::date as trade_date,
        null::date as last_trade_date,
        latest_upload_positions.product::varchar as nav_product,
        product_aliases.marex_product::varchar as marex_product,
        case
            when trim(coalesce(latest_upload_positions.long_short, '')) = 'SHORT' then 'S'
            when trim(coalesce(latest_upload_positions.long_short, '')) = 'LONG' then 'B'
        end::varchar as buy_sell,
        latest_upload_positions.quantity_1::double precision as qty,
        latest_upload_positions.multiplier_and_tick_value::double precision as lots,
        latest_upload_positions.market_settlement_price::double precision as settlement_price,
        latest_upload_positions.trade_price::double precision as trade_price,
        latest_upload_positions.market_value_in_native_currency::double precision as market_value,
        null::date as last_trade_date_filled,
        null::numeric as marex_delta_filled,
        null::numeric as days_to_expiry,
        month_codes.month_code::varchar as futures_contract_month,
        case
            when month_codes.month_code is not null
                and latest_upload_positions.contract_yyyymm is not null
            then month_codes.month_code || right(left(latest_upload_positions.contract_yyyymm, 4), 1)
        end::varchar as futures_contract_month_y,
        case
            when month_codes.month_code is not null
                and latest_upload_positions.contract_yyyymm is not null
            then month_codes.month_code || right(left(latest_upload_positions.contract_yyyymm, 4), 2)
        end::varchar as futures_contract_month_yy,
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

with_gas_lots as (
    select
        normalized.*,
        case
            when normalized.lots = 2500
                and normalized.exchange_code in ('HHD', 'H', 'PHH', 'PHE')
            then normalized.qty / 4
            else normalized.qty
        end as gas_qty,
        case
            when normalized.lots = 2500
                and normalized.exchange_code in ('HHD', 'H', 'PHH', 'PHE')
            then normalized.lots * 4
            else normalized.lots
        end as gas_lots,
        trim(
            trailing '.'
            from trim(
                trailing '0'
                from to_char(normalized.strike_price, 'FM999999999.999')
            )
        ) as strike_text
    from normalized
),

with_descriptions as (
    select
        with_gas_lots.*,
        case
            when is_option then trim(concat(
                case when put_call = 'C' then 'CALL' when put_call = 'P' then 'PUT' end,
                ' ',
                to_char(to_date(contract_yyyymm, 'YYYYMM'), 'MON YY'),
                ' ',
                exchange_name,
                ' ',
                marex_product,
                ' ',
                to_char(strike_price::numeric, 'FM999990.00'),
                ' '
            ))
            when contract_day is not null then trim(concat(
                to_char(contract_yyyymmdd::date, 'DD MON YY'),
                ' ',
                exchange_name,
                ' ',
                marex_product,
                ' '
            ))
            when contract_day is null and not is_option then trim(concat(
                to_char(to_date(contract_yyyymm, 'YYYYMM'), 'MON YY'),
                ' ',
                exchange_name,
                ' ',
                marex_product,
                ' '
            ))
        end as marex_description
    from with_gas_lots
),

with_symbols as (
    select
        with_descriptions.*,
        case
            when exchange_name = 'IFED' and exchange_code = 'HHD' then exchange_code || ' B0-IUS'
            when exchange_name = 'IFED' and exchange_code_grouping = 'SHORT_TERM_POWER_RT' then exchange_code || ' D0-IUS'
            when exchange_name = 'IFED' and is_option then exchange_code || ' '
                || futures_contract_month_yy || put_call || strike_price::integer::text || '-IUS'
            when exchange_name = 'IFED' and not is_option and contract_day is null then exchange_code || ' '
                || futures_contract_month_yy || '-IUS'
        end as ice_xl_symbol,
        case
            when exchange_name = 'IFED' and is_option then exchange_code_underlying || ' '
                || futures_contract_month_yy || '-IUS'
        end as ice_xl_symbol_underlying,
        case
            when exchange_code in ('HP', 'PHH', 'HH', 'H', 'NG') then '1|G|XNYM:F:NG:' || contract_yyyymm
            when exchange_code in ('LN', 'PHE') then '1|G|XNYM:O:LN:' || contract_yyyymm
                || ':' || put_call || ':' || strike_text
            when exchange_code in ('LN1', 'LN2', 'LN3', 'LN4', 'LN5') then '1|G|XNYM:O:KN'
                || substring(exchange_code from 3) || ':' || contract_yyyymm || ':' || put_call || ':' || strike_text
            when exchange_code in ('JN1', 'KN2', 'KN3', 'KN4') then '1|G|XNYM:O:'
                || exchange_code || ':' || contract_yyyymm || ':' || put_call || ':' || strike_text
            when exchange_code in ('G3', 'G4') then 'CAL_SPREAD_CME_EXCEL_CODE'
        end as cme_excel_symbol,
        case
            when is_option and exchange_code in ('LN', 'PHE') then concat(
                bbg_exchange_code,
                futures_contract_month_y,
                put_call,
                ' ',
                strike_text
            )
        end as bbg_symbol,
        case
            when is_option and exchange_code in ('LN', 'PHE') then concat(
                case when put_call = 'C' then 'CALL' else 'PUT' end,
                ' ',
                to_char(to_date(substring(contract_yyyymm, 5, 2), 'MM'), 'MON'),
                ' ',
                contract_year,
                ' ',
                to_char(strike_price, 'FM90.00')
            )
            when is_option and exchange_code in ('LN1', 'LN2', 'LN3', 'LN4', 'LN5') then concat(
                case when put_call = 'C' then 'CALL' else 'PUT' end,
                ' ',
                to_char(to_date(substring(contract_yyyymm, 5, 2), 'MM'), 'MON'),
                ' ',
                contract_year,
                ' WKLY WEEK',
                substring(exchange_code, 3, 2),
                ' ',
                to_char(strike_price, 'FM90.00')
            )
            when is_option and exchange_code in ('G3', 'G4') then concat(
                case when put_call = 'C' then 'CALL' else 'PUT' end,
                ' ',
                to_char(to_date(substring(contract_yyyymm, 5, 2), 'MM'), 'MON'),
                ' ',
                contract_year,
                ' CAL SPREAD ',
                substring(exchange_code, 2, 1),
                ' MONTHS ',
                to_char(strike_price, 'FM90.00')
            )
        end as bbg_option_description
    from with_descriptions
),

FINAL as (
    select
        sftp_date,
        sftp_upload_timestamp,
        source_table,
        reference_number,
        account,
        exchange_name,
        exchange_code,
        is_option,
        put_call,
        strike_price,
        marex_delta,
        contract_yyyymm,
        contract_yyyymmdd,
        contract_year,
        contract_month,
        contract_day,
        trade_date,
        last_trade_date,
        nav_product,
        marex_description,
        buy_sell,
        qty,
        lots,
        settlement_price,
        trade_price,
        market_value,
        last_trade_date_filled,
        marex_delta_filled,
        account_name,
        days_to_expiry,
        gas_qty,
        gas_lots,
        futures_contract_month,
        futures_contract_month_y,
        futures_contract_month_yy,
        exchange_code_grouping,
        exchange_code_region,
        exchange_code_underlying,
        bbg_exchange_code,
        ice_xl_symbol,
        ice_xl_symbol_underlying,
        cme_excel_symbol,
        bbg_symbol,
        bbg_option_description
    from with_symbols
    where sftp_date = (select max(sftp_date) from with_symbols)
      and exchange_code_grouping in ('GAS_FUTURES')
      and exchange_code in ('NG', 'HP', 'HH', 'PHH', 'H')
      and (days_to_expiry >= 0 or days_to_expiry is null)
)

select *
from FINAL
order by
    sftp_date desc,
    contract_yyyymm,
    exchange_code,
    account
