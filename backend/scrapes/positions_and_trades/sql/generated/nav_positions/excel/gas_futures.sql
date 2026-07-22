with  __dbt__cte__nav_v3_00_src_positions as (
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
),  __dbt__cte__utils_v3_positions_and_trades_account_lookup as (
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
),  __dbt__cte__nav_v3_10_int_clean as (
with positions as (
    select * from __dbt__cte__nav_v3_00_src_positions
),

accounts as (
    select * from __dbt__cte__utils_v3_positions_and_trades_account_lookup
    where source = 'nav'
),

FINAL as (
    select
    positions.*,
    accounts.account_name,
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
),  __dbt__cte__utils_v3_positions_and_trades_product_aliases as (
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
),  __dbt__cte__nav_v3_20_int_product_matches as (
with positions as (
    select * from __dbt__cte__nav_v3_10_int_clean
),

product_aliases as (
    select * from __dbt__cte__utils_v3_positions_and_trades_product_aliases
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
),  __dbt__cte__utils_v3_positions_and_trades_product_catalog as (
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
),  __dbt__cte__nav_v3_30_int_rules as (
with positions as (
    select * from __dbt__cte__nav_v3_20_int_product_matches
),

product_catalog as (
    select * from __dbt__cte__utils_v3_positions_and_trades_product_catalog
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
    positions.account_name,
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
    positions.counter_currency_ccy2,
    positions.ccy2_long_short,
    positions.ccy2_quantity_2,
    positions.trade_price,
    positions.multiplier_and_tick_value,
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
    positions.source_1_symbol,
    positions.source_3_symbol,
    positions.one_chicago_symbol,
    positions.fas_level,
    positions.option_style,
    positions.created_at,
    positions.updated_at,
    product_catalog.product_code,
    product_catalog.product_family,
    product_catalog.market_name,
    case when positions.is_option then product_catalog.underlying_product_code end as underlying_product_code,
    product_catalog.bbg_exchange_code,
    product_catalog.default_exchange_name,
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
from positions
left join product_catalog
    on product_catalog.product_code = positions.matched_product_code
)

select *
from FINAL
),  __dbt__cte__nav_v3_40_positions_all_history as (
with positions as (
    select * from __dbt__cte__nav_v3_30_int_rules
),

FINAL as (
    select *
    from positions
)

select *
from FINAL
),  __dbt__cte__utils_v3_positions_and_trades_month_codes as (
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
),  __dbt__cte__nav_v3_excel_10_position_rows as (
with positions as (
    select * from __dbt__cte__nav_v3_40_positions_all_history
),

product_aliases as (
    select * from __dbt__cte__utils_v3_positions_and_trades_product_aliases
    where source = 'nav'
),

month_codes as (
    select * from __dbt__cte__utils_v3_positions_and_trades_month_codes
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
),  __dbt__cte__nav_v3_excel_20_positions_grouped as (
with position_rows as (
    select * from __dbt__cte__nav_v3_excel_10_position_rows
),

grouped as (
    select
        md5(concat_ws(
            '||',
            coalesce(exchange_name, '<null>'),
            coalesce(exchange_code_grouping, '<null>'),
            coalesce(exchange_code_region, '<null>'),
            coalesce(exchange_code, '<null>'),
            coalesce(is_option::text, '<null>'),
            coalesce(put_call, '<null>'),
            coalesce(strike_price::text, '<null>'),
            coalesce(contract_yyyymm, '<null>'),
            coalesce(contract_yyyymmdd::text, '<null>'),
            coalesce(contract_day::text, '<null>'),
            coalesce(gas_lots::text, '<null>')
        )) as position_group_key,
        sftp_date,
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
        futures_contract_month_y,
        futures_contract_month_yy,
        gas_lots::double precision as lots,
        max(marex_product)::varchar as marex_product,
        max(bbg_exchange_code)::varchar as bbg_exchange_code,
        avg(settlement_price) as settlement_price_total,
        avg(trade_price) as trade_price_total,
        sum(gas_qty) as qty_total,
        sum(case when account_name = 'ACIM' then gas_qty else 0 end) as qty_acim,
        sum(case when account_name = 'PNT' then gas_qty else 0 end) as qty_pnt,
        sum(case when account_name = 'DICKSON' then gas_qty else 0 end) as qty_dickson,
        sum(case when account_name = 'TITAN' then gas_qty else 0 end) as qty_titan
    from position_rows
    group by
        sftp_date,
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
        futures_contract_month_y,
        futures_contract_month_yy,
        gas_lots
),

with_display_fields as (
    select
        grouped.*,
        trim(
            trailing '.'
            from trim(
                trailing '0'
                from to_char(strike_price, 'FM999999999.999')
            )
        ) as strike_text,
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
    from grouped
),

with_symbols as (
    select
        with_display_fields.*,
        case
            when exchange_name = 'IFED' and exchange_code = 'HHD' then exchange_code || ' B0-IUS'
            when exchange_name = 'IFED' and exchange_code_grouping = 'SHORT_TERM_POWER_RT' then exchange_code || ' D0-IUS'
            when exchange_name = 'IFED' and is_option then exchange_code || ' '
                || futures_contract_month_yy || put_call || strike_price::integer::text || '-IUS'
            when exchange_name = 'IFED' and not is_option and contract_day is null then exchange_code || ' '
                || futures_contract_month_yy || '-IUS'
        end as ice_xl_symbol,
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
                case when put_call = 'C' then 'CALL' else 'PUT' end,
                ' ',
                to_char(to_date(substring(contract_yyyymm, 5, 2), 'MM'), 'MON'),
                ' ',
                left(contract_yyyymm, 4),
                ' ',
                to_char(strike_price, 'FM90.00')
            )
            when is_option and exchange_code in ('LN1', 'LN2', 'LN3', 'LN4', 'LN5') then concat(
                case when put_call = 'C' then 'CALL' else 'PUT' end,
                ' ',
                to_char(to_date(substring(contract_yyyymm, 5, 2), 'MM'), 'MON'),
                ' ',
                left(contract_yyyymm, 4),
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
                left(contract_yyyymm, 4),
                ' CAL SPREAD ',
                substring(exchange_code, 2, 1),
                ' MONTHS ',
                to_char(strike_price, 'FM90.00')
            )
        end as bbg_option_description
    from with_display_fields
),

FINAL as (
    select
        position_group_key,
        sftp_date,
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
        futures_contract_month_y,
        futures_contract_month_yy,
        marex_description,
        ice_xl_symbol,
        cme_excel_symbol,
        bbg_option_description,
        lots,
        settlement_price_total,
        trade_price_total,
        qty_total,
        qty_acim,
        qty_pnt,
        qty_dickson,
        qty_titan
    from with_symbols
)

select *
from FINAL
order by
    sftp_date desc,
    exchange_code_grouping,
    exchange_code,
    is_option,
    put_call,
    strike_price,
    contract_yyyymm
),  __dbt__cte__nav_v3_excel_30_positions_grouped_latest as (
with grouped_positions as (
    select * from __dbt__cte__nav_v3_excel_20_positions_grouped
),

latest_dates as (
    select
        max(sftp_date) as latest_date_positions,
        min(sftp_date) as second_latest_date_positions
    from (
        select distinct sftp_date
        from grouped_positions
        order by sftp_date desc
        limit 2
    ) as latest_two_dates
),

latest_two_dates as (
    select grouped_positions.*
    from grouped_positions
    where sftp_date::date >= (select second_latest_date_positions::date from latest_dates)
),

with_previous_measures as (
    select
        lag(sftp_date, 1) over (
            partition by position_group_key
            order by sftp_date
        ) as previous_sftp_date,
        lag(settlement_price_total, 1) over (
            partition by position_group_key
            order by sftp_date
        ) as previous_settlement_price_total,
        lag(qty_total, 1) over (
            partition by position_group_key
            order by sftp_date
        ) as previous_qty_total,
        latest_two_dates.*
    from latest_two_dates
),

with_pnl as (
    select
        sftp_date,
        previous_sftp_date,
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
        futures_contract_month_y,
        futures_contract_month_yy,
        marex_description,
        ice_xl_symbol,
        cme_excel_symbol,
        bbg_option_description,
        lots,
        settlement_price_total,
        previous_settlement_price_total,
        trade_price_total,
        qty_total,
        qty_acim,
        qty_pnt,
        qty_dickson,
        qty_titan,
        previous_qty_total,
        case
            when previous_qty_total is not null then qty_total - previous_qty_total
        end as dod_qty_total,
        case
            when previous_sftp_date is not null then settlement_price_total - previous_settlement_price_total
            when previous_sftp_date is null and trade_price_total is not null then settlement_price_total - trade_price_total
        end as daily_change_total,
        case
            when previous_sftp_date is not null then (settlement_price_total - previous_settlement_price_total) * qty_total * lots
            when previous_sftp_date is null and trade_price_total is not null then (settlement_price_total - trade_price_total) * qty_total * lots
        end as daily_pnl_total
    from with_previous_measures
    where sftp_date::date = (select latest_date_positions::date from latest_dates)
),

FINAL as (
    select
        sftp_date,
        previous_sftp_date,
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
        futures_contract_month_y,
        futures_contract_month_yy,
        marex_description,
        ice_xl_symbol,
        cme_excel_symbol,
        bbg_option_description,
        lots,
        round(daily_pnl_total::numeric, 3)::double precision as daily_pnl_total,
        round(settlement_price_total::numeric, 3)::double precision as settlement_price_total,
        round(previous_settlement_price_total::numeric, 3)::double precision as previous_settlement_price_total,
        round(daily_change_total::numeric, 3)::double precision as daily_change_total,
        qty_total,
        previous_qty_total,
        dod_qty_total,
        qty_acim,
        qty_pnt,
        qty_dickson,
        qty_titan
    from with_pnl
)

select *
from FINAL
order by
    sftp_date desc,
    contract_yyyymm,
    contract_yyyymmdd,
    marex_description
), grouped_latest as (
    select * from __dbt__cte__nav_v3_excel_30_positions_grouped_latest
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