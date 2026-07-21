with position_rows as (
    select * from {{ ref('nav_excel_10_position_rows') }}
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
