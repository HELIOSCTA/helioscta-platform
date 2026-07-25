with  __dbt__cte__nav_ref_00_src_positions as (
with source_rows as (
    select * from "helios_prod"."nav"."positions"
),

FINAL as (
    select
    fund_code,
    source_legal_entity,
    source_file_name,
    source_file_row_number,
    nav_date,
    sftp_upload_timestamp::timestamp as sftp_upload_timestamp,
    broker_name,
    account_group,
    account,
    trade_date,
    product_id_internal,
    product,
    type,
    month_year,
    client_symbol,
    strike_price,
    call_put,
    product_currency_1,
    long_short,
    quantity_1,
    counter_currency_ccy2,
    ccy2_long_short,
    ccy2_quantity_2,
    trade_price,
    multiplier_and_tick_value,
    cost_in_native_currency,
    open_exchange_rate,
    cost_in_base_currency,
    market_settlement_price,
    market_value_in_native_currency,
    close_exchange_rate,
    market_value_in_base_currency,
    sector,
    sub_sector,
    country,
    exchange_name,
    source_1_symbol,
    source_3_symbol,
    one_chicago_symbol,
    fas_level,
    option_style,
    created_at::timestamp as created_at,
    updated_at::timestamp as updated_at
from source_rows
)

select *
from FINAL
),  __dbt__cte__utils_ref_positions_and_trades_account_lookup as (
with source_rows as (
    select * from "helios_prod"."positions_and_trades_ref"."account_lookup"
),

FINAL as (
    select
        account_name,
        account,
        source,
        source_label
    from source_rows
)

select *
from FINAL
),  __dbt__cte__nav_ref_10_int_clean as (
with positions as (
    select * from __dbt__cte__nav_ref_00_src_positions
),

accounts as (
    select * from __dbt__cte__utils_ref_positions_and_trades_account_lookup
    where source = 'nav'
),

FINAL as (
    select
    positions.*,
    positions.account as source_account_key,
    accounts.account_name as account_code,
    accounts.account_name,
    case
        when accounts.account_name is not null then 'matched'
        when nullif(trim(positions.account), '') is null then 'missing_source_account'
        else 'unmapped'
    end as account_lookup_status,
    positions.exchange_name as source_exchange_name,
    true as is_product_record,
    upper(regexp_replace(coalesce(positions.product, ''), '[[:space:]]+', ' ', 'g')) as product_norm,
    (
        upper(coalesce(positions.call_put, '')) in ('CALL', 'PUT', 'C', 'P')
        or upper(coalesce(positions.type, '')) like '%OPTION%'
    ) as is_option,
    case
        when upper(coalesce(positions.call_put, '')) in ('CALL', 'C') then 'C'
        when upper(coalesce(positions.call_put, '')) in ('PUT', 'P') then 'P'
    end as put_call_code,
    case
        when positions.month_year ~ '^\s*\d{1,2}/\d{1,2}/\d{4}\s*$'
        then to_char(to_date(trim(positions.month_year), 'MM/DD/YYYY'), 'YYYYMM')
        when upper(trim(coalesce(positions.month_year, ''))) ~ '^[A-Z]{3}\d{2}$'
        then to_char(to_date(upper(trim(positions.month_year)), 'MONYY'), 'YYYYMM')
    end as contract_yyyymm,
    case
        when positions.month_year ~ '^\s*\d{1,2}/\d{1,2}/\d{4}\s*$'
        then extract(day from to_date(trim(positions.month_year), 'MM/DD/YYYY'))::integer
    end as contract_day,
    case
        when positions.strike_price is null then null
        else round(positions.strike_price::numeric, 3)::double precision
    end as strike_price_normalized
from positions
left join accounts
    on positions.account = accounts.account
)

select *
from FINAL
),  __dbt__cte__utils_ref_positions_and_trades_product_aliases as (
with source_rows as (
    select * from "helios_prod"."positions_and_trades_ref"."product_alias_rules"
),

FINAL as (
    select
        source_priority,
        source,
        match_type,
        pattern,
        product_code,
        option_type,
        marex_product
    from source_rows
)

select *
from FINAL
),  __dbt__cte__nav_ref_20_int_product_matches as (
with positions as (
    select * from __dbt__cte__nav_ref_10_int_clean
),

product_aliases as (
    select * from __dbt__cte__utils_ref_positions_and_trades_product_aliases
    where source = 'nav'
),

FINAL as (
    select
    positions.*,
    matched_alias.source_priority as rule_priority,
    matched_alias.match_type as rule_match_type,
    matched_alias.pattern as rule_pattern,
    matched_alias.product_code as matched_product_code
from positions
left join lateral (
    select product_aliases.*
    from product_aliases
    where (
            (
                product_aliases.match_type = 'exact'
                and positions.product_norm = product_aliases.pattern
            )
            or (
                product_aliases.match_type = 'regex'
                and positions.product_norm ~* product_aliases.pattern
            )
        )
      and (
            product_aliases.option_type is null
            or product_aliases.option_type = case when positions.is_option then 'option' else 'future' end
        )
    order by product_aliases.source_priority
    limit 1
) as matched_alias on true
)

select *
from FINAL
),  __dbt__cte__utils_ref_positions_and_trades_product_catalog as (
with source_rows as (
    select * from "helios_prod"."positions_and_trades_ref"."product_catalog"
),

FINAL as (
    select
        product_code,
        product_family,
        market_name,
        underlying_product_code,
        bbg_exchange_code,
        default_exchange_name
    from source_rows
)

select *
from FINAL
),  __dbt__cte__nav_ref_30_int_rules as (
with positions as (
    select * from __dbt__cte__nav_ref_20_int_product_matches
),

product_catalog as (
    select * from __dbt__cte__utils_ref_positions_and_trades_product_catalog
),

positions_with_effective_product as (
    select
        positions.*,

        -- NAV can label PJM Western Hub day-ahead weekend deliveries as PDA.
        -- Keep the source product/rule diagnostics intact, but expose the
        -- effective ICE short-term weekend product downstream.
        case
            when
                positions.matched_product_code = 'PDA'
                and not positions.is_option
                and positions.contract_yyyymm ~ '^\d{6}$'
                and positions.contract_day is not null
                and extract(isodow from to_date(
                    positions.contract_yyyymm
                    || lpad(positions.contract_day::text, 2, '0'),
                    'YYYYMMDD'
                ))::integer in (6, 7)
            then 'PDO'
            else positions.matched_product_code
        end as effective_product_code
    from positions
),

FINAL as (
    select
    positions.fund_code,
    positions.source_legal_entity,
    positions.source_file_name,
    positions.source_file_row_number,
    positions.nav_date,
    positions.sftp_upload_timestamp,
    positions.broker_name,
    positions.account_group,
    positions.account,
    positions.source_account_key,
    positions.account_code,
    positions.account_name,
    positions.account_lookup_status,
    positions.trade_date,
    positions.product_id_internal,
    positions.product,
    positions.type,
    positions.month_year,
    positions.client_symbol,
    positions.strike_price,
    positions.call_put,
    positions.product_currency_1,
    positions.long_short,
    positions.quantity_1,
    case
        when positions.multiplier_and_tick_value = 2500
            and positions.effective_product_code in ('HHD', 'H', 'PHH', 'PHE')
        then positions.quantity_1 / 4
        else positions.quantity_1
    end as gas_qty,
    positions.counter_currency_ccy2,
    positions.ccy2_long_short,
    positions.ccy2_quantity_2,
    positions.trade_price,
    positions.multiplier_and_tick_value,
    case
        when positions.multiplier_and_tick_value = 2500
            and positions.effective_product_code in ('HHD', 'H', 'PHH', 'PHE')
        then positions.multiplier_and_tick_value * 4
        else positions.multiplier_and_tick_value
    end as gas_lots,
    positions.cost_in_native_currency,
    positions.open_exchange_rate,
    positions.cost_in_base_currency,
    positions.market_settlement_price,
    positions.market_value_in_native_currency,
    positions.close_exchange_rate,
    positions.market_value_in_base_currency,
    positions.sector,
    positions.sub_sector,
    positions.country,
    positions.exchange_name,
    positions.source_exchange_name,
    coalesce(
        product_catalog.default_exchange_name,
        case
            when upper(trim(coalesce(positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
            when trim(coalesce(positions.exchange_name, '')) <> '' then 'IFED'
        end
    ) as exchange_route_code,
    case
        when coalesce(
            product_catalog.default_exchange_name,
            case
                when upper(trim(coalesce(positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                when trim(coalesce(positions.exchange_name, '')) <> '' then 'IFED'
            end
        ) in ('IFED', 'IFE', 'IPE') then 'ice'
        when coalesce(
            product_catalog.default_exchange_name,
            case
                when upper(trim(coalesce(positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                when trim(coalesce(positions.exchange_name, '')) <> '' then 'IFED'
            end
        ) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'nymex'
        when coalesce(
            product_catalog.default_exchange_name,
            case
                when upper(trim(coalesce(positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                when trim(coalesce(positions.exchange_name, '')) <> '' then 'IFED'
            end
        ) is null then 'missing'
        else 'unsupported'
    end as route_family,
    positions.is_product_record,
    positions.source_1_symbol,
    positions.source_3_symbol,
    positions.one_chicago_symbol,
    positions.fas_level,
    positions.option_style,
    positions.created_at,
    positions.updated_at,
    positions.effective_product_code as product_code,
    coalesce(effective_product_catalog.product_family, product_catalog.product_family) as product_code_family,
    case
        when coalesce(effective_product_catalog.product_family, product_catalog.product_family) in ('Gas', 'Basis') and positions.is_option
        then 'gas_option'
        when coalesce(effective_product_catalog.product_family, product_catalog.product_family) in ('Gas', 'Basis')
        then 'gas_future'
        when coalesce(effective_product_catalog.product_family, product_catalog.product_family) = 'Power' and positions.is_option
        then 'power_option'
        when coalesce(effective_product_catalog.product_family, product_catalog.product_family) = 'Power'
        then 'power_future'
    end as product_code_grouping,
    coalesce(effective_product_catalog.market_name, product_catalog.market_name) as product_code_region,
    case when positions.is_option then coalesce(effective_product_catalog.underlying_product_code, product_catalog.underlying_product_code) end as product_code_underlying,
    coalesce(effective_product_catalog.product_family, product_catalog.product_family) as product_family,
    coalesce(effective_product_catalog.market_name, product_catalog.market_name) as market_name,
    case when positions.is_option then coalesce(effective_product_catalog.underlying_product_code, product_catalog.underlying_product_code) end as underlying_product_code,
    coalesce(effective_product_catalog.bbg_exchange_code, product_catalog.bbg_exchange_code) as bbg_exchange_code,
    coalesce(effective_product_catalog.default_exchange_name, product_catalog.default_exchange_name) as default_exchange_name,
    positions.contract_yyyymm,
    positions.contract_day,
    positions.put_call_code as put_call_code,
    positions.strike_price_normalized,
    case
        when product_catalog.product_code is null then 'unresolved_product'
        when coalesce(trim(positions.month_year), '') <> '' and positions.contract_yyyymm is null then 'unparsed_contract'
        when positions.is_option and positions.put_call_code is null then 'option_missing_put_call'
        when positions.is_option and positions.strike_price is null then 'option_missing_strike'
        else 'ok'
    end as rule_status,
    positions.rule_priority,
    positions.rule_match_type,
    positions.rule_pattern
from positions_with_effective_product as positions
left join product_catalog
    on product_catalog.product_code = positions.matched_product_code
left join product_catalog as effective_product_catalog
    on effective_product_catalog.product_code = positions.effective_product_code
)

select *
from FINAL
),  __dbt__cte__nav_ref_40_positions_all_history as (
with positions as (
    select * from __dbt__cte__nav_ref_30_int_rules
),

FINAL as (
    select *
    from positions
)

select *
from FINAL
),  __dbt__cte__nav_ref_excel_05_recent_positions_all_history as (
-- Excel-scoped recent NAV rows selected from the canonical all-history contract.

with positions as (
    select * from __dbt__cte__nav_ref_40_positions_all_history
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
),  __dbt__cte__utils_ref_positions_and_trades_month_codes as (
with source_rows as (
    select * from "helios_prod"."positions_and_trades_ref"."month_codes"
),

FINAL as (
    select
        month_number,
        month_name,
        month_code
    from source_rows
)

select *
from FINAL
), positions as (
    select * from __dbt__cte__nav_ref_excel_05_recent_positions_all_history
),

product_aliases as (
    select * from __dbt__cte__utils_ref_positions_and_trades_product_aliases
    where source = 'nav'
),

month_codes as (
    select * from __dbt__cte__utils_ref_positions_and_trades_month_codes
),

latest_upload_positions as (
    select *
    from positions
),

normalized as (
    select
        latest_upload_positions.fund_code,
        latest_upload_positions.nav_date::date as sftp_date,
        latest_upload_positions.sftp_upload_timestamp::timestamp as sftp_upload_timestamp,
        'NAV'::varchar as source_table,
        latest_upload_positions.product_id_internal::varchar as reference_number,
        latest_upload_positions.account::varchar as account,
        latest_upload_positions.source_account_key::varchar as source_account_key,
        latest_upload_positions.account_code::varchar as account_code,
        latest_upload_positions.account_name::varchar as account_name,
        latest_upload_positions.account_lookup_status::varchar as account_lookup_status,
        latest_upload_positions.source_exchange_name::varchar as source_exchange_name,
        coalesce(
            latest_upload_positions.exchange_route_code,
            case
                when upper(trim(coalesce(latest_upload_positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                when trim(coalesce(latest_upload_positions.exchange_name, '')) <> '' then 'IFED'
            end
        )::varchar as exchange_name,
        coalesce(
            latest_upload_positions.exchange_route_code,
            case
                when upper(trim(coalesce(latest_upload_positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                when trim(coalesce(latest_upload_positions.exchange_name, '')) <> '' then 'IFED'
            end
        )::varchar as exchange_route_code,
        coalesce(
            latest_upload_positions.route_family,
            case
                when coalesce(
                    latest_upload_positions.exchange_route_code,
                    case
                        when upper(trim(coalesce(latest_upload_positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                        when trim(coalesce(latest_upload_positions.exchange_name, '')) <> '' then 'IFED'
                    end
                ) in ('IFED', 'IFE', 'IPE') then 'ice'
                when coalesce(
                    latest_upload_positions.exchange_route_code,
                    case
                        when upper(trim(coalesce(latest_upload_positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                        when trim(coalesce(latest_upload_positions.exchange_name, '')) <> '' then 'IFED'
                    end
                ) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'nymex'
                when coalesce(
                    latest_upload_positions.exchange_route_code,
                    case
                        when upper(trim(coalesce(latest_upload_positions.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                        when trim(coalesce(latest_upload_positions.exchange_name, '')) <> '' then 'IFED'
                    end
                ) is null then 'missing'
                else 'unsupported'
            end
        )::varchar as route_family,
        latest_upload_positions.is_product_record::boolean as is_product_record,
        latest_upload_positions.product_code::varchar as exchange_code,
        case
            when latest_upload_positions.is_option and latest_upload_positions.product_code = 'PMI' then 'POWER_OPTIONS'
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
            when
                not latest_upload_positions.is_option
                and latest_upload_positions.product_family = 'Power'
                and latest_upload_positions.contract_day is not null
                and latest_upload_positions.product_code in (
                    'PDP', 'PWA', 'DDP', 'ODP', 'ERA', 'END', 'NED', 'NDA',
                    'PDA', 'PJL', 'PDO', 'NEZ', 'SDP'
                )
            then 'SHORT_TERM_POWER'
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
        latest_upload_positions.gas_qty::double precision as gas_qty,
        latest_upload_positions.multiplier_and_tick_value::double precision as lots,
        latest_upload_positions.gas_lots::double precision as gas_lots,
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

with_strike_text as (
    select
        normalized.*,
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
        with_strike_text.*,
        case
            when contract_yyyymmdd is not null and sftp_date is not null
            then contract_yyyymmdd - sftp_date
        end as daily_contract_calendar_offset_days,
        extract(isodow from contract_yyyymmdd)::integer between 1 and 5 as daily_contract_is_weekday,
        case
            when contract_yyyymmdd is null or sftp_date is null then null
            when contract_yyyymmdd >= sftp_date
            then (
                select count(*)::integer
                from generate_series(
                    sftp_date + interval '1 day',
                    contract_yyyymmdd,
                    interval '1 day'
                ) as business_days(calendar_date)
                where extract(isodow from business_days.calendar_date)::integer between 1 and 5
            )
            else -1 * (
                select count(*)::integer
                from generate_series(
                    contract_yyyymmdd + interval '1 day',
                    sftp_date,
                    interval '1 day'
                ) as business_days(calendar_date)
                where extract(isodow from business_days.calendar_date)::integer between 1 and 5
            )
        end as daily_contract_business_offset_days,
        case
            when contract_yyyymmdd is not null and sftp_date is not null
            then floor((
                date_trunc('week', contract_yyyymmdd)::date
                - date_trunc('week', sftp_date)::date
            ) / 7.0)::integer
        end as daily_contract_week_offset,
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
    from with_strike_text
),

with_symbols as (
    select
        with_descriptions.*,
        case
            when exchange_name = 'IFED' and exchange_code = 'HHD' then exchange_code || ' B0-IUS'
            when
                exchange_name = 'IFED'
                and not is_option
                and exchange_code = 'PDO'
                and contract_yyyymmdd is not null
                and not daily_contract_is_weekday
            then 'PDO P1-IUS'
            -- BalDay exports keep prior-business-day expiry rows. ICE XL has
            -- no verified negative-day symbol here, so bucket these with the
            -- current daily code used for same-day expiry rows.
            when
                exchange_name = 'IFED'
                and not is_option
                and exchange_code in ('PDP', 'PWA', 'PDA', 'PJL', 'SDP', 'DDP', 'ERA', 'END', 'NEZ', 'NED', 'NDA')
                and contract_yyyymmdd is not null
                and daily_contract_is_weekday
                and daily_contract_business_offset_days = -1
            then exchange_code || ' D0-IUS'
            when
                exchange_name = 'IFED'
                and not is_option
                and exchange_code in ('PDP', 'PWA', 'DDP', 'ERA', 'END')
                and contract_yyyymmdd is not null
                and daily_contract_is_weekday
                and daily_contract_business_offset_days = 0
            then exchange_code || ' D0-IUS'
            when
                exchange_name = 'IFED'
                and not is_option
                and exchange_code in ('PDP', 'PWA', 'PDA', 'PJL', 'SDP', 'ERA', 'END', 'NEZ', 'NED', 'NDA')
                and contract_yyyymmdd is not null
                and daily_contract_is_weekday
                and daily_contract_business_offset_days = 1
            then exchange_code || ' D1-IUS'
            when
                exchange_name = 'IFED'
                and not is_option
                and contract_yyyymmdd is not null
                and daily_contract_is_weekday
                and daily_contract_business_offset_days > 1
                and (
                    (
                        exchange_code in ('PDP', 'PWA')
                        and daily_contract_week_offset between 0 and 4
                    )
                    or (
                        exchange_code in ('ERA', 'END')
                        and daily_contract_week_offset between 0 and 1
                    )
                    or (
                        exchange_code = 'NED'
                        and daily_contract_week_offset between 0 and 2
                    )
                    or (
                        exchange_code = 'NDA'
                        and daily_contract_week_offset = 0
                    )
                )
            then exchange_code || ' W' || daily_contract_week_offset::text || '-IUS'
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
        source_account_key,
        account_code,
        account_lookup_status,
        source_exchange_name,
        exchange_name,
        exchange_route_code,
        route_family,
        is_product_record,
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