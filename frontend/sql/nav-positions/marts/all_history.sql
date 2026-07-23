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
), positions as (
    select * from __dbt__cte__nav_ref_30_int_rules
),

FINAL as (
    select *
    from positions
)

select *
from FINAL