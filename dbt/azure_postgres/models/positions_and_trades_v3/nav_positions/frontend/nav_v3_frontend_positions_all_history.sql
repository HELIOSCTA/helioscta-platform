-- Frontend-facing all-history NAV position rows.
--
-- This is a thin projection over the canonical v3 all-history mart. Product,
-- contract, account, and rule matching logic stays upstream in v3; this model
-- only exposes stable names and helper fields for the NAV positions UI.

with positions as (
    select * from {{ ref('nav_v3_40_positions_all_history') }}
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
        upper(regexp_replace(coalesce(positions.product, ''), '[[:space:]]+', ' ', 'g')) as product_norm,
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
        positions.product_code,
        positions.product_family as product_group,
        positions.market_name as product_region,
        positions.underlying_product_code,
        positions.bbg_exchange_code,
        positions.default_exchange_name,
        positions.contract_yyyymm,
        positions.contract_day,
        positions.put_call_code as put_call,
        positions.strike_price_normalized as normalized_strike_price,
        case
            when positions.strike_price_normalized is not null then 'option'
            else 'future'
        end as instrument_type,
        case
            when positions.contract_yyyymm ~ '^\d{6}$' and positions.contract_day is not null
            then to_date(
                positions.contract_yyyymm || lpad(positions.contract_day::integer::text, 2, '0'),
                'YYYYMMDD'
            )
        end as contract_date,
        case
            when positions.contract_yyyymm ~ '^\d{6}$'
            then to_date(positions.contract_yyyymm || '01', 'YYYYMMDD')
        end as contract_month_date,
        positions.rule_status as normalization_status,
        positions.rule_priority,
        positions.rule_match_type,
        positions.rule_pattern
    from positions
)

select *
from FINAL
