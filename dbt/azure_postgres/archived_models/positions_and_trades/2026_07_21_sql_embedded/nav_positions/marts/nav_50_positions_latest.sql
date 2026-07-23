-- Latest NAV positions with dbt-derived rule fields.
--
-- Keep this latest mart optimized for frontend review: choose each fund's
-- latest NAV date and upload before running product matching.

with source_positions as (
    select * from {{ ref('nav_00_src_positions') }}
),

accounts as (
    select * from {{ ref('utils_v2_positions_and_trades_account_lookup') }}
    where source = 'nav'
),

product_aliases as (
    select * from {{ ref('utils_v2_positions_and_trades_product_aliases') }}
    where source = 'nav'
),

product_catalog as (
    select * from {{ ref('utils_v2_positions_and_trades_product_catalog') }}
),

latest_file_by_fund as (
    select distinct on (positions.fund_code)
        positions.fund_code,
        positions.nav_date,
        positions.sftp_upload_timestamp::timestamp as sftp_upload_timestamp
    from {{ source('nav_v1', 'positions') }} as positions
    order by
        positions.fund_code,
        positions.nav_date desc,
        positions.sftp_upload_timestamp desc
),

latest_positions as (
    select source_positions.*
    from source_positions
    inner join latest_file_by_fund
        on latest_file_by_fund.fund_code = source_positions.fund_code
       and latest_file_by_fund.nav_date = source_positions.nav_date
       and latest_file_by_fund.sftp_upload_timestamp = source_positions.sftp_upload_timestamp
),

clean_positions as (
    select
        latest_positions.*,
        accounts.account_name,
        upper(regexp_replace(coalesce(latest_positions.product, ''), '[[:space:]]+', ' ', 'g')) as product_norm,
        (
            upper(coalesce(latest_positions.call_put, '')) in ('CALL', 'PUT', 'C', 'P')
            or upper(coalesce(latest_positions.type, '')) like '%OPTION%'
        ) as is_option,
        case
            when upper(coalesce(latest_positions.call_put, '')) in ('CALL', 'C') then 'C'
            when upper(coalesce(latest_positions.call_put, '')) in ('PUT', 'P') then 'P'
        end as put_call_code,
        case
            when latest_positions.month_year ~ '^\s*\d{1,2}/\d{1,2}/\d{4}\s*$'
            then to_char(to_date(trim(latest_positions.month_year), 'MM/DD/YYYY'), 'YYYYMM')
            when upper(trim(coalesce(latest_positions.month_year, ''))) ~ '^[A-Z]{3}\d{2}$'
            then to_char(to_date(upper(trim(latest_positions.month_year)), 'MONYY'), 'YYYYMM')
        end as contract_yyyymm,
        case
            when latest_positions.month_year ~ '^\s*\d{1,2}/\d{1,2}/\d{4}\s*$'
            then extract(day from to_date(trim(latest_positions.month_year), 'MM/DD/YYYY'))::integer
        end as contract_day,
        case
            when latest_positions.strike_price is null then null
            else round(latest_positions.strike_price::numeric, 3)::double precision
        end as strike_price_normalized
    from latest_positions
    left join accounts
        on latest_positions.account = accounts.account
),

matched_positions as (
    select
        clean_positions.*,
        matched_alias.source_priority as rule_priority,
        matched_alias.match_type as rule_match_type,
        matched_alias.pattern as rule_pattern,
        matched_alias.product_code as matched_product_code
    from clean_positions
    left join lateral (
        select product_aliases.*
        from product_aliases
        where (
                (
                    product_aliases.match_type = 'exact'
                    and clean_positions.product_norm = product_aliases.pattern
                )
                or (
                    product_aliases.match_type = 'regex'
                    and clean_positions.product_norm ~* product_aliases.pattern
                )
            )
          and (
                product_aliases.option_type is null
                or product_aliases.option_type = case when clean_positions.is_option then 'option' else 'future' end
            )
        order by product_aliases.source_priority
        limit 1
    ) as matched_alias on true
),

FINAL as (
    select
        matched_positions.fund_code,
        matched_positions.source_legal_entity,
        matched_positions.source_file_name,
        matched_positions.source_file_row_number,
        matched_positions.nav_date,
        matched_positions.sftp_upload_timestamp,
        matched_positions.broker_name,
        matched_positions.account_group,
        matched_positions.account,
        matched_positions.account_name,
        matched_positions.trade_date,
        matched_positions.product_id_internal,
        matched_positions.product,
        matched_positions.type,
        matched_positions.month_year,
        matched_positions.client_symbol,
        matched_positions.strike_price,
        matched_positions.call_put,
        matched_positions.product_currency_1,
        matched_positions.long_short,
        matched_positions.quantity_1,
        matched_positions.counter_currency_ccy2,
        matched_positions.ccy2_long_short,
        matched_positions.ccy2_quantity_2,
        matched_positions.trade_price,
        matched_positions.multiplier_and_tick_value,
        matched_positions.cost_in_native_currency,
        matched_positions.open_exchange_rate,
        matched_positions.cost_in_base_currency,
        matched_positions.market_settlement_price,
        matched_positions.market_value_in_native_currency,
        matched_positions.close_exchange_rate,
        matched_positions.market_value_in_base_currency,
        matched_positions.sector,
        matched_positions.sub_sector,
        matched_positions.country,
        matched_positions.exchange_name,
        matched_positions.source_1_symbol,
        matched_positions.source_3_symbol,
        matched_positions.one_chicago_symbol,
        matched_positions.fas_level,
        matched_positions.option_style,
        matched_positions.created_at,
        matched_positions.updated_at,
        product_catalog.product_code,
        product_catalog.product_family,
        product_catalog.market_name,
        case when matched_positions.is_option then product_catalog.underlying_product_code end as underlying_product_code,
        product_catalog.bbg_exchange_code,
        product_catalog.default_exchange_name,
        matched_positions.contract_yyyymm,
        matched_positions.contract_day,
        matched_positions.put_call_code as put_call_code,
        matched_positions.strike_price_normalized,
        case
            when product_catalog.product_code is null then 'unresolved_product'
            when coalesce(trim(matched_positions.month_year), '') <> '' and matched_positions.contract_yyyymm is null then 'unparsed_contract'
            when matched_positions.is_option and matched_positions.put_call_code is null then 'option_missing_put_call'
            when matched_positions.is_option and matched_positions.strike_price is null then 'option_missing_strike'
            else 'ok'
        end as rule_status,
        matched_positions.rule_priority,
        matched_positions.rule_match_type,
        matched_positions.rule_pattern
    from matched_positions
    left join product_catalog
        on product_catalog.product_code = matched_positions.matched_product_code
)

select *
from FINAL
