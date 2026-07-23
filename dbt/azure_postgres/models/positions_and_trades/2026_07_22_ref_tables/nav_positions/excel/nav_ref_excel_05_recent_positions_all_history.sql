with source_rows as (
    select * from {{ ref('nav_ref_00_src_positions') }}
),

latest_nav_dates as (
    select nav_date
    from (
        select distinct nav_date::date as nav_date
        from source_rows
        where nav_date is not null
        order by nav_date desc
        limit 2
    ) as recent_dates
),

recent_source_rows as (
    select source_rows.*
    from source_rows
    inner join latest_nav_dates
        on latest_nav_dates.nav_date = source_rows.nav_date::date
),

latest_upload_by_fund_date as (
    select
        fund_code,
        nav_date,
        max(sftp_upload_timestamp) as sftp_upload_timestamp
    from recent_source_rows
    group by fund_code, nav_date
),

latest_upload_source_rows as (
    select recent_source_rows.*
    from recent_source_rows
    inner join latest_upload_by_fund_date
        on latest_upload_by_fund_date.fund_code = recent_source_rows.fund_code
       and latest_upload_by_fund_date.nav_date = recent_source_rows.nav_date
       and latest_upload_by_fund_date.sftp_upload_timestamp = recent_source_rows.sftp_upload_timestamp
),

accounts as (
    select * from {{ ref('utils_ref_positions_and_trades_account_lookup') }}
    where source = 'nav'
),

product_aliases as (
    select * from {{ ref('utils_ref_positions_and_trades_product_aliases') }}
    where source = 'nav'
),

product_catalog as (
    select * from {{ ref('utils_ref_positions_and_trades_product_catalog') }}
),

cleaned as (
    select
        latest_upload_source_rows.*,
        latest_upload_source_rows.account as source_account_key,
        accounts.account_name as account_code,
        accounts.account_name,
        case
            when accounts.account_name is not null then 'matched'
            when nullif(trim(latest_upload_source_rows.account), '') is null then 'missing_source_account'
            else 'unmapped'
        end as account_lookup_status,
        latest_upload_source_rows.exchange_name as source_exchange_name,
        true as is_product_record,
        upper(regexp_replace(coalesce(latest_upload_source_rows.product, ''), '[[:space:]]+', ' ', 'g')) as product_norm,
        (
            upper(coalesce(latest_upload_source_rows.call_put, '')) in ('CALL', 'PUT', 'C', 'P')
            or upper(coalesce(latest_upload_source_rows.type, '')) like '%OPTION%'
        ) as is_option,
        case
            when upper(coalesce(latest_upload_source_rows.call_put, '')) in ('CALL', 'C') then 'C'
            when upper(coalesce(latest_upload_source_rows.call_put, '')) in ('PUT', 'P') then 'P'
        end as put_call_code,
        case
            when latest_upload_source_rows.month_year ~ '^\s*\d{1,2}/\d{1,2}/\d{4}\s*$'
            then to_char(to_date(trim(latest_upload_source_rows.month_year), 'MM/DD/YYYY'), 'YYYYMM')
            when upper(trim(coalesce(latest_upload_source_rows.month_year, ''))) ~ '^[A-Z]{3}\d{2}$'
            then to_char(to_date(upper(trim(latest_upload_source_rows.month_year)), 'MONYY'), 'YYYYMM')
        end as contract_yyyymm,
        case
            when latest_upload_source_rows.month_year ~ '^\s*\d{1,2}/\d{1,2}/\d{4}\s*$'
            then extract(day from to_date(trim(latest_upload_source_rows.month_year), 'MM/DD/YYYY'))::integer
        end as contract_day,
        case
            when latest_upload_source_rows.strike_price is null then null
            else round(latest_upload_source_rows.strike_price::numeric, 3)::double precision
        end as strike_price_normalized
    from latest_upload_source_rows
    left join accounts
        on latest_upload_source_rows.account = accounts.account
),

position_matches as (
    select
        cleaned.*,
        matched_alias.source_priority as rule_priority,
        matched_alias.match_type as rule_match_type,
        matched_alias.pattern as rule_pattern,
        matched_alias.product_code as matched_product_code
    from cleaned
    left join lateral (
        select product_aliases.*
        from product_aliases
        where (
                (
                    product_aliases.match_type = 'exact'
                    and cleaned.product_norm = product_aliases.pattern
                )
                or (
                    product_aliases.match_type = 'regex'
                    and cleaned.product_norm ~* product_aliases.pattern
                )
            )
          and (
                product_aliases.option_type is null
                or product_aliases.option_type = case when cleaned.is_option then 'option' else 'future' end
            )
        order by product_aliases.source_priority
        limit 1
    ) as matched_alias on true
),

position_matches_with_effective_product as (
    select
        position_matches.*,
        case
            when
                position_matches.matched_product_code = 'PDA'
                and not position_matches.is_option
                and position_matches.contract_yyyymm ~ '^\d{6}$'
                and position_matches.contract_day is not null
                and extract(isodow from to_date(
                    position_matches.contract_yyyymm
                    || lpad(position_matches.contract_day::text, 2, '0'),
                    'YYYYMMDD'
                ))::integer in (6, 7)
            then 'PDO'
            else position_matches.matched_product_code
        end as effective_product_code
    from position_matches
),

with_rules as (
    select
        position_matches.fund_code,
        position_matches.source_legal_entity,
        position_matches.source_file_name,
        position_matches.source_file_row_number,
        position_matches.nav_date,
        position_matches.sftp_upload_timestamp,
        position_matches.broker_name,
        position_matches.account_group,
        position_matches.account,
        position_matches.source_account_key,
        position_matches.account_code,
        position_matches.account_name,
        position_matches.account_lookup_status,
        position_matches.trade_date,
        position_matches.product_id_internal,
        position_matches.product,
        position_matches.type,
        position_matches.month_year,
        position_matches.client_symbol,
        position_matches.strike_price,
        position_matches.call_put,
        position_matches.product_currency_1,
        position_matches.long_short,
        position_matches.quantity_1,
        position_matches.counter_currency_ccy2,
        position_matches.ccy2_long_short,
        position_matches.ccy2_quantity_2,
        position_matches.trade_price,
        position_matches.multiplier_and_tick_value,
        position_matches.cost_in_native_currency,
        position_matches.open_exchange_rate,
        position_matches.cost_in_base_currency,
        position_matches.market_settlement_price,
        position_matches.market_value_in_native_currency,
        position_matches.close_exchange_rate,
        position_matches.market_value_in_base_currency,
        position_matches.sector,
        position_matches.sub_sector,
        position_matches.country,
        position_matches.exchange_name,
        position_matches.source_exchange_name,
        coalesce(
            product_catalog.default_exchange_name,
            case
                when upper(trim(coalesce(position_matches.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                when trim(coalesce(position_matches.exchange_name, '')) <> '' then 'IFED'
            end
        ) as exchange_route_code,
        case
            when coalesce(
                product_catalog.default_exchange_name,
                case
                    when upper(trim(coalesce(position_matches.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                    when trim(coalesce(position_matches.exchange_name, '')) <> '' then 'IFED'
                end
            ) in ('IFED', 'IFE', 'IPE') then 'ice'
            when coalesce(
                product_catalog.default_exchange_name,
                case
                    when upper(trim(coalesce(position_matches.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                    when trim(coalesce(position_matches.exchange_name, '')) <> '' then 'IFED'
                end
            ) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'nymex'
            when coalesce(
                product_catalog.default_exchange_name,
                case
                    when upper(trim(coalesce(position_matches.exchange_name, ''))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'NYME'
                    when trim(coalesce(position_matches.exchange_name, '')) <> '' then 'IFED'
                end
            ) is null then 'missing'
            else 'unsupported'
        end as route_family,
        position_matches.is_product_record,
        position_matches.is_option,
        position_matches.source_1_symbol,
        position_matches.source_3_symbol,
        position_matches.one_chicago_symbol,
        position_matches.fas_level,
        position_matches.option_style,
        position_matches.created_at,
        position_matches.updated_at,
        position_matches.effective_product_code as product_code,
        coalesce(effective_product_catalog.product_family, product_catalog.product_family) as product_code_family,
        case
            when coalesce(effective_product_catalog.product_family, product_catalog.product_family) in ('Gas', 'Basis') and position_matches.is_option
            then 'gas_option'
            when coalesce(effective_product_catalog.product_family, product_catalog.product_family) in ('Gas', 'Basis')
            then 'gas_future'
            when coalesce(effective_product_catalog.product_family, product_catalog.product_family) = 'Power' and position_matches.is_option
            then 'power_option'
            when coalesce(effective_product_catalog.product_family, product_catalog.product_family) = 'Power'
            then 'power_future'
        end as product_code_grouping,
        coalesce(effective_product_catalog.market_name, product_catalog.market_name) as product_code_region,
        case when position_matches.is_option then coalesce(effective_product_catalog.underlying_product_code, product_catalog.underlying_product_code) end as product_code_underlying,
        coalesce(effective_product_catalog.product_family, product_catalog.product_family) as product_family,
        coalesce(effective_product_catalog.market_name, product_catalog.market_name) as market_name,
        case when position_matches.is_option then coalesce(effective_product_catalog.underlying_product_code, product_catalog.underlying_product_code) end as underlying_product_code,
        coalesce(effective_product_catalog.bbg_exchange_code, product_catalog.bbg_exchange_code) as bbg_exchange_code,
        coalesce(effective_product_catalog.default_exchange_name, product_catalog.default_exchange_name) as default_exchange_name,
        position_matches.contract_yyyymm,
        position_matches.contract_day,
        position_matches.put_call_code as put_call_code,
        position_matches.strike_price_normalized,
        case
            when product_catalog.product_code is null then 'unresolved_product'
            when coalesce(trim(position_matches.month_year), '') <> '' and position_matches.contract_yyyymm is null then 'unparsed_contract'
            when position_matches.is_option and position_matches.put_call_code is null then 'option_missing_put_call'
            when position_matches.is_option and position_matches.strike_price is null then 'option_missing_strike'
            else 'ok'
        end as rule_status,
        position_matches.rule_priority,
        position_matches.rule_match_type,
        position_matches.rule_pattern
    from position_matches_with_effective_product as position_matches
    left join product_catalog
        on product_catalog.product_code = position_matches.matched_product_code
    left join product_catalog as effective_product_catalog
        on effective_product_catalog.product_code = position_matches.effective_product_code
),

FINAL as (
    select * from with_rules
)

select *
from FINAL
