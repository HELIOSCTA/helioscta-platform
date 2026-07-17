-- Vendor product-code construction.
--
-- This stage derives product identifiers used by downstream MUFG review/export
-- workflows. It intentionally runs after rule resolution so vendor codes are
-- based on canonical product_code, rule_exchange_name, option side, strike, and
-- contract month helpers rather than raw Clear Street strings.

with trades as (
    select * from {{ ref('cs_50_int_rules') }}
),

strike_base as (
    select
        contract_base.*,

        -- Format strikes without meaningless trailing zeros for vendor symbols.
        -- Example: 3.750 becomes 3.75 so option symbols do not carry
        -- vendor-hostile padding.
        trim(
            trailing '.'
            from trim(
                trailing '0'
                from to_char(strike_price_normalized, 'FM999999999.999')
            )
        ) as strike_text,

        -- Daily/weekly ICE short-term symbols are not based on contract_yyyymm.
        -- For Clear Street rows, the most precise delivery date is usually the
        -- trailing YYYYMMDD embedded in CUSIP, e.g. IFEDPDP20260720. If CUSIP
        -- does not carry a valid date, fall back to the parsed contract parts.
        coalesce(
            contract_base.cusip_contract_date,
            contract_base.contract_date_from_parts
        ) as daily_contract_date,

        -- Prefer the Clear Street trade date; sftp_date is only a fallback for
        -- malformed or missing trade_date strings.
        coalesce(contract_base.trade_date_parsed, contract_base.sftp_date) as daily_trade_date,

        -- Calendar-day offset from trade date to delivery date. This is used
        -- only for exact D0/D1 classification. A positive offset greater than
        -- one is not automatically D1 because PDP/PWA can represent weekly or
        -- forward short-term strips.
        coalesce(
            contract_base.cusip_contract_date,
            contract_base.contract_date_from_parts
        ) - coalesce(contract_base.trade_date_parsed, contract_base.sftp_date) as daily_contract_offset_days,

        -- Monday-start week offset between trade week and delivery week.
        -- This supports PDP W0-W4 mapping, which matches the local PJM ICE
        -- registry. Other products are left null unless explicitly supported.
        floor((
            date_trunc('week', coalesce(
                contract_base.cusip_contract_date,
                contract_base.contract_date_from_parts
            ))::date
            - date_trunc('week', coalesce(contract_base.trade_date_parsed, contract_base.sftp_date))::date
        ) / 7.0)::integer as daily_contract_week_offset
    from (
        select
            trades.*,

            -- Clear Street IFED CUSIPs commonly end with the delivery date.
            -- Validate the suffix before to_date so malformed identifiers do
            -- not silently become incorrect dates.
            case
                when substring(trades.cusip from '([0-9]{8})$') ~ '^(19|20|21)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$'
                then to_date(substring(trades.cusip from '([0-9]{8})$'), 'YYYYMMDD')
            end as cusip_contract_date,

            -- Generic fallback for source rows with explicit year/month/day
            -- pieces. This is less source-specific than CUSIP and is therefore
            -- only used when CUSIP does not contain a valid delivery date.
            case
                when trades.contract_year is not null
                    and trades.contract_month_number is not null
                    and trades.contract_day is not null
                then make_date(trades.contract_year, trades.contract_month_number, trades.contract_day)
            end as contract_date_from_parts
        from trades
    ) as contract_base
),

export_base as (
    select
        strike_base.*,

        -- ICE codes cover IFED futures/options plus daily and weekly products.
        -- For short-term products, derive only symbols supported by the local
        -- PJM/ICE registries from Clear Street trade date and CUSIP date.
        case
            -- Same-day PJM RT daily products.
            when
                strike_base.rule_exchange_name = 'IFED'
                and not strike_base.is_option
                and strike_base.product_code in ('PDP', 'PWA')
                and strike_base.daily_contract_offset_days = 0
            then strike_base.product_code || ' D0-IUS'

            -- Next-day daily products. Keep this to offset = 1 only; larger
            -- offsets may be weekly/forward strips and should not be forced
            -- into a D1 symbol.
            when
                strike_base.rule_exchange_name = 'IFED'
                and not strike_base.is_option
                and strike_base.product_code in ('PDP', 'PWA', 'PDA', 'PJL', 'SDP', 'END')
                and strike_base.daily_contract_offset_days = 1
            then strike_base.product_code || ' D1-IUS'

            -- PDP has explicit weekly symbols in the PJM registry. Map only
            -- week buckets that exist locally; leave other products/null cases
            -- unresolved for review rather than guessing.
            when
                strike_base.rule_exchange_name = 'IFED'
                and not strike_base.is_option
                and strike_base.product_code = 'PDP'
                and strike_base.daily_contract_offset_days > 1
                and strike_base.daily_contract_week_offset between 0 and 4
            then strike_base.product_code || ' W' || strike_base.daily_contract_week_offset::text || '-IUS'

            -- Henry Hub daily swing style code.
            when strike_base.rule_exchange_name = 'IFED' and strike_base.product_code = 'HHD'
            then strike_base.product_code || ' B0-IUS'

            -- ICE option symbols include product, month/year, put/call, and
            -- strike. Use strike_text so decimal strikes such as 3.75 are not
            -- rounded to whole numbers.
            when
                strike_base.rule_exchange_name = 'IFED'
                and strike_base.is_option
                and strike_base.put_call_code is not null
                and strike_base.strike_text is not null
                and strike_base.futures_month_code_yy is not null
            then strike_base.product_code || ' ' || strike_base.futures_month_code_yy || strike_base.put_call_code
                || strike_base.strike_text || '-IUS'

            -- Standard monthly IFED futures.
            when
                strike_base.rule_exchange_name = 'IFED'
                and not strike_base.is_option
                and strike_base.contract_day is null
                and strike_base.futures_month_code_yy is not null
            then strike_base.product_code || ' ' || strike_base.futures_month_code_yy || '-IUS'
        end as ice_product_code
    from strike_base
)

select
    export_base.*,

    -- CME Excel codes are only available for products covered by the legacy map.
    -- Products outside this explicit list intentionally remain null until a
    -- verified vendor-code pattern is added.
    case
        when product_code in ('HP', 'PHH', 'HH', 'H', 'NG') and contract_yyyymm is not null
        then '1|G|XNYM:F:NG:' || contract_yyyymm
        when
            product_code in ('LN', 'PHE')
            and contract_yyyymm is not null
            and put_call_code is not null
            and strike_price_normalized is not null
        then '1|G|XNYM:O:LN:' || contract_yyyymm || ':' || put_call_code || ':' || strike_text
        when
            product_code in ('LN1', 'LN2', 'LN3', 'LN4', 'LN5')
            and contract_yyyymm is not null
            and put_call_code is not null
            and strike_price_normalized is not null
        then '1|G|XNYM:O:KN' || substring(product_code from 3) || ':'
            || contract_yyyymm || ':' || put_call_code || ':' || strike_text
        when
            product_code in ('JN1', 'KN2', 'KN3', 'KN4')
            and contract_yyyymm is not null
            and put_call_code is not null
            and strike_price_normalized is not null
        then '1|G|XNYM:O:' || product_code || ':'
            || contract_yyyymm || ':' || put_call_code || ':' || strike_text
    end as cme_product_code,

    -- Bloomberg codes depend on product-specific exchange prefixes.
    -- These mappings are intentionally narrow; unsupported products should
    -- stay null so review queries can find gaps instead of receiving invented
    -- Bloomberg symbols.
    case
        when product_code = 'HP' and bbg_exchange_code = 'ZA' and futures_month_code_y is not null
        then bbg_exchange_code || futures_month_code_y || ' COMDTY'
        when product_code = 'HH' and bbg_exchange_code = 'IW' and futures_month_code_y is not null
        then bbg_exchange_code || futures_month_code_y || ' COMDTY'
        when product_code = 'NG' and bbg_exchange_code = 'NG' and futures_month_code_yy is not null
        then bbg_exchange_code || futures_month_code_yy || ' COMDTY'
        when
            product_code in ('LN', 'PHE')
            and bbg_exchange_code = 'NG'
            and futures_month_code_y is not null
            and put_call_code is not null
            and strike_text is not null
        then bbg_exchange_code || futures_month_code_y || put_call_code || ' '
            || strike_text || ' COMDTY'
        when
            product_code in ('LN1', 'LN2', 'LN3', 'LN4', 'LN5')
            and futures_month_code_yy is not null
            and put_call_code is not null
            and strike_text is not null
        then bbg_exchange_code || futures_month_code_yy || put_call_code
            || substring(product_code from 3) || ' ' || strike_text || ' COMB'
        when
            product_code in ('JN1', 'KN2', 'KN3', 'KN4')
            and futures_month_code_yy is not null
            and put_call_code is not null
            and strike_text is not null
        then bbg_exchange_code || futures_month_code_yy || put_call_code
            || substring(product_code from 3) || ' ' || strike_text || ' Comdty'
    end as bbg_product_code
from export_base
