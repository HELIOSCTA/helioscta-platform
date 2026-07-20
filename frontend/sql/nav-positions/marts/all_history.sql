with  __dbt__cte__nav_00_src_positions as (
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
),  __dbt__cte__utils_v2_positions_and_trades_account_lookup as (
with account_lookup(account_name, account, source, source_label) as (

    values



        -- ACIM

        ('ACIM', 'UBE 10051', 'nav', 'NAV Position File'),

        ('ACIM', '51014112.0', 'nav', 'NAV Position File'),

        ('ACIM', '51014112', 'nav', 'NAV Position File'),

        -- IOAGR ... EFD, 365

        ('ACIM', 'EFD', 'clear_street', 'Clear Street Trades'),

        ('ACIM', '365', 'clear_street', 'Clear Street Trades'),



        -- PNT

        ('PNT', 'ABN AMRO_1251PT034', 'nav', 'NAV Position File'),

        -- IOPNT ... FCR,  690

        ('PNT', 'FCR', 'clear_street', 'Clear Street Trades'),

        ('PNT', '690', 'clear_street', 'Clear Street Trades'),



        -- DICKSON

        ('DICKSON', 'RJO_35511229', 'nav', 'NAV Position File'),

        -- IOMOR ... RJO, 685

        ('DICKSON', 'RJO', 'clear_street', 'Clear Street Trades'),

        ('DICKSON', '685', 'clear_street', 'Clear Street Trades'),



        -- TITAN

        ('TITAN', '969 ESKHL', 'nav', 'NAV Position File'),

        -- ITITA ... ADU, 905

        ('TITAN', 'ADU', 'clear_street', 'Clear Street Trades'),

        ('TITAN', '905', 'clear_street', 'Clear Street Trades')

),

FINAL as (
    select * from account_lookup
)

select *
from FINAL
),  __dbt__cte__nav_10_int_clean as (
with positions as (
    select * from __dbt__cte__nav_00_src_positions
),

accounts as (
    select * from __dbt__cte__utils_v2_positions_and_trades_account_lookup
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
),  __dbt__cte__utils_v2_positions_and_trades_product_aliases as (
with product_aliases(

    source_priority,

    source,

    match_type,

    pattern,

    product_code,

    option_type

) as (

    values

        (1, 'nav', 'regex', '^ICE NGAS HH SWG DLY DAY-[0-9]+$', 'HHD', null),

        (2, 'nav', 'exact', 'ICE NGAS HH SWING DAILY', 'HHD', null),

        (3, 'nav', 'exact', 'NATURAL GAS', 'NG', null),

        (4, 'nav', 'exact', 'GLOBEX NATURAL GAS LD', 'HH', null),

        (5, 'nav', 'exact', 'NYMEX HENRY HUB FINANCIAL LDO', 'HH', null),

        (6, 'nav', 'exact', 'NYMEX HENRY HUB NATURAL GAS', 'HP', null),

        (7, 'nav', 'exact', 'HENRY PENULTIMATE NATURAL GAS', 'HP', null),

        (8, 'nav', 'exact', 'NATURAL GAS LD1 FUTURE', 'H', null),

        (9, 'nav', 'exact', 'HENRY HUB NATURAL GAS', 'H', null),

        (10, 'nav', 'exact', 'ICE PHH', 'PHH', null),

        (11, 'nav', 'exact', 'ICE PHE', 'PHE', 'option'),

        (12, 'nav', 'exact', 'ICE HH EQ', 'PHE', 'option'),

        (13, 'nav', 'exact', 'ICE NGAS PEN HENRY HUB', 'PHE', 'option'),

        (14, 'nav', 'exact', 'NYM EUR NATURAL GAS', 'LN', 'option'),

        (15, 'nav', 'exact', 'NATURAL GAS CLEARPORT', 'LN', 'option'),

        (16, 'nav', 'exact', 'NATURAL GAS FINANCIAL WEEK 1', 'LN1', 'option'),

        (17, 'nav', 'exact', 'NATURAL GAS FINANCIAL WEEK 2', 'LN2', 'option'),

        (18, 'nav', 'exact', 'NATURAL GAS FINANCIAL WEEK 3', 'LN3', 'option'),

        (19, 'nav', 'exact', 'NATURAL GAS FINANCIAL WEEK 4', 'LN4', 'option'),

        (20, 'nav', 'exact', 'NATURAL GAS FINANCIAL WEEK 5', 'LN5', 'option'),

        (21, 'nav', 'exact', 'NATURAL GAS 3M CSO', 'G3', 'option'),

        (22, 'nav', 'exact', 'NATURAL GAS FINANCIAL 1M SO', 'G4', 'option'),

        (23, 'nav', 'exact', 'NATURAL GAS 1M CSO', 'G4', 'option'),

        (24, 'nav', 'exact', 'ICE PJM WH RTD', 'PDP', null),

        (25, 'nav', 'exact', 'ICE PWA', 'PWA', null),

        (26, 'nav', 'exact', 'ICE PJMWHPKDAY', 'PDA', null),

        (27, 'nav', 'exact', 'ICE PJL', 'PJL', null),

        (28, 'nav', 'exact', 'ICE PDA', 'PDA', null),

        (29, 'nav', 'exact', 'ICE PJL DAILY', 'PJL', null),

        (30, 'nav', 'regex', '^ICE (PJM MINI|MINIPJMRT|PJM WHREAL TYM PK MINI)([-_][0-9]+)?$', 'PMI', null),

        (31, 'nav', 'exact', 'ICE PJM WHRT PEAK OPT_4096', 'P1X', 'option'),

        (32, 'nav', 'regex', '^ICE PJM OFF PK[-_][0-9]+$', 'OPJ', null),

        (33, 'nav', 'exact', 'ICE ERA', 'ERA', null),

        (34, 'nav', 'exact', 'ERCOT N 345 KV RT PEAK DLY', 'ERN', null),

        (35, 'nav', 'exact', 'ICE END', 'END', null),

        (36, 'nav', 'regex', '^ICE ERCOT NORTH 345KV 7X8[-_][0-9]+$', 'ECI', null),

        (37, 'nav', 'regex', '^(ISO ENG MASS HUB D-PK-[0-9]+|ICE NEPOOL PK MNTH-[0-9]+)$', 'NEP', null),

        (38, 'nav', 'regex', '^ICE SP 15 PEAK([_-][0-9]+)?$', 'SPM', null),

        (39, 'nav', 'regex', '^ICE NP 15 PEAK([_-][0-9]+)?$', 'NPM', null),

        (40, 'nav', 'regex', '^ICE MID-C PEAK([_-][0-9]+)?$', 'MDC', null),

        (41, 'nav', 'exact', 'AB NIT BASIS FUTURE', 'AEC', null),

        (42, 'nav', 'exact', 'ICE ALQCTYGTSW', 'ALQ', null),

        (43, 'nav', 'exact', 'ICE CIG ROCKIES BASIS', 'CRI', null),

        (44, 'nav', 'exact', 'ICE CHICAGO BASIS FUT', 'DGD', null),

        (45, 'nav', 'exact', 'ICE EASTERN GAS SOUTH BASIS FU', 'DOM', null),

        (46, 'nav', 'exact', 'ICE HSC BASIS', 'HXS', null),

        (47, 'nav', 'exact', 'NGPL TXOK BASIS FUTURE', 'NTO', null),

        (48, 'nav', 'exact', 'ICE NGAS NYM NWP RK', 'NWR', null),

        (49, 'nav', 'exact', 'ICE NGAS NYM PG&E', 'PGE', null),

        (50, 'nav', 'exact', 'ICE TETCO SWP', 'TMT', null),
        (51, 'nav', 'exact', 'ICE TRANSCO STATION 85 ZONE 4', 'TRZ', null),
        (52, 'nav', 'exact', 'ICE TCOZN4BASI', 'TRZ', null),
        (53, 'nav', 'exact', 'ICE SDP', 'SDP', null)
),

FINAL as (
    select * from product_aliases
)

select *
from FINAL
),  __dbt__cte__nav_20_int_product_matches as (
with positions as (
    select * from __dbt__cte__nav_10_int_clean
),

product_aliases as (
    select * from __dbt__cte__utils_v2_positions_and_trades_product_aliases
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
),  __dbt__cte__utils_v2_positions_and_trades_product_catalog as (
with product_catalog(

    product_code,

    product_family,

    market_name,

    underlying_product_code,

    bbg_exchange_code,

    default_exchange_name

) as (

    values

        ('HHD', 'Gas', 'Henry Hub', null, null, 'IFED'),

        ('NG', 'Gas', 'Henry Hub', null, 'NG', 'NYME'),

        ('HH', 'Gas', 'Henry Hub', null, 'IW', 'NYME'),

        ('HP', 'Gas', 'Henry Hub', null, 'ZA', 'NYME'),

        ('H', 'Gas', 'Henry Hub', null, null, 'IFED'),

        ('PHH', 'Gas', 'Henry Hub', null, null, 'IFED'),

        ('PHE', 'Gas', 'Henry Hub', 'NG', null, 'IFED'),

        ('LN', 'Gas', 'Henry Hub', 'NG', 'NG', 'NYME'),

        ('LN1', 'Gas', 'Henry Hub', 'NG', 'NGW', 'NYME'),

        ('LN2', 'Gas', 'Henry Hub', 'NG', 'NGW', 'NYME'),

        ('LN3', 'Gas', 'Henry Hub', 'NG', 'NGW', 'NYME'),

        ('LN4', 'Gas', 'Henry Hub', 'NG', 'NGW', 'NYME'),

        ('LN5', 'Gas', 'Henry Hub', 'NG', 'NGW', 'NYME'),

        ('JN1', 'Gas', 'Henry Hub', 'NG', null, 'NYME'),

        ('KN2', 'Gas', 'Henry Hub', 'NG', null, 'NYME'),

        ('KN3', 'Gas', 'Henry Hub', 'NG', null, 'NYME'),

        ('KN4', 'Gas', 'Henry Hub', 'NG', 'HZI', 'NYME'),

        ('G3', 'Gas', 'Henry Hub', 'NG', null, 'NYME'),

        ('G4', 'Gas', 'Henry Hub', 'NG', null, 'NYME'),

        ('PDP', 'Power', 'PJM', null, null, 'IFED'),

        ('PWA', 'Power', 'PJM', null, null, 'IFED'),

        ('DDP', 'Power', 'PJM', null, null, 'IFED'),

        ('PDA', 'Power', 'PJM', null, null, 'IFED'),

        ('PJL', 'Power', 'PJM', null, null, 'IFED'),

        ('PMI', 'Power', 'PJM', 'PMI', null, 'IFED'),

        ('P1X', 'Power', 'PJM', 'PMI', null, 'IFED'),

        ('OPJ', 'Power', 'PJM', null, null, 'IFED'),

        ('ODP', 'Power', 'PJM', null, null, 'IFED'),

        ('ERA', 'Power', 'ERCOT', null, null, 'IFED'),

        ('ERN', 'Power', 'ERCOT', null, null, 'IFED'),

        ('END', 'Power', 'ERCOT', null, null, 'IFED'),

        ('ECI', 'Power', 'ERCOT', null, null, 'IFED'),

        ('NEZ', 'Power', 'NEPOOL', null, null, 'IFED'),

        ('NEP', 'Power', 'NEPOOL', null, null, 'IFED'),

        ('SPM', 'Power', 'CAISO', null, null, 'IFED'),

        ('SDP', 'Power', 'CAISO', null, null, 'IFED'),

        ('NPM', 'Power', 'CAISO', null, null, 'IFED'),

        ('MDC', 'Power', 'Mid-C', null, null, 'IFED'),

        ('AEC', 'Basis', 'AECO', null, null, 'IFED'),

        ('ALQ', 'Basis', 'Algonquin', null, null, 'IFED'),

        ('CRI', 'Basis', 'CIG Rockies', null, null, 'IFED'),

        ('DGD', 'Basis', 'Chicago', null, null, 'IFED'),

        ('DOM', 'Basis', 'Eastern Gas South', null, null, 'IFED'),

        ('HXS', 'Basis', 'Houston Ship Channel', null, null, 'IFED'),

        ('UCS', 'Basis', 'Houston Ship Channel', null, null, 'IFED'),

        ('NTO', 'Basis', 'NGPL TXOK', null, null, 'IFED'),

        ('NWR', 'Basis', 'Northwest Rockies', null, null, 'IFED'),

        ('PGE', 'Basis', 'PG&E Citygate', null, null, 'IFED'),

        ('TMT', 'Basis', 'Tetco M3', null, null, 'IFED'),

        ('TRZ', 'Basis', 'Transco Zone 4', null, null, 'IFED')

),

FINAL as (
    select * from product_catalog
)

select *
from FINAL
),  __dbt__cte__nav_30_int_rules as (
with positions as (
    select * from __dbt__cte__nav_20_int_product_matches
),

product_catalog as (
    select * from __dbt__cte__utils_v2_positions_and_trades_product_catalog
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
), positions as (
    select * from __dbt__cte__nav_30_int_rules
),

FINAL as (
    select *
    from positions
)

select *
from FINAL
order by
    nav_date desc,
    sftp_upload_timestamp desc,
    fund_code,
    account_group,
    account,
    product_code,
    contract_yyyymm,
    contract_day