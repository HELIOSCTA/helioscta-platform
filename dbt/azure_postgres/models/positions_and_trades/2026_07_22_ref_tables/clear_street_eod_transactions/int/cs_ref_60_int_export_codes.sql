-- Vendor product-code construction.
--
-- This stage derives product identifiers used by downstream MUFG review/export
-- workflows. It intentionally runs after rule resolution so vendor codes are
-- based on canonical product_code, rule_exchange_name, option side, strike, and
-- contract month helpers rather than raw Clear Street strings.

with trades as (
    select * from {{ ref('cs_ref_50_int_rules') }}
),

strike_base_raw as (
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
        ) as strike_text_raw,

        -- Daily/weekly ICE short-term symbols are not based on contract_yyyymm.
        -- For Clear Street rows, the most precise delivery date is usually the
        -- trailing YYYYMMDD embedded in CUSIP, e.g. IFEDPDP20260720. If CUSIP
        -- does not carry a valid date, fall back to the parsed contract parts.
        coalesce(
            contract_base.cusip_contract_date,
            contract_base.contract_date_from_parts
        ) as daily_contract_date,
        extract(isodow from coalesce(
            contract_base.cusip_contract_date,
            contract_base.contract_date_from_parts
        ))::integer between 1 and 5 as daily_contract_is_weekday,

        -- Prefer the Clear Street trade date; sftp_date is only a fallback for
        -- malformed or missing trade_date strings.
        coalesce(contract_base.trade_date_parsed, contract_base.sftp_date) as daily_trade_date,

        -- Calendar-day offset from trade date to delivery date. Keep this for
        -- audit/debugging; D0/D1 symbol classification uses the weekday-only
        -- business offset below.
        coalesce(
            contract_base.cusip_contract_date,
            contract_base.contract_date_from_parts
        ) - coalesce(contract_base.trade_date_parsed, contract_base.sftp_date) as daily_contract_calendar_offset_days,

        -- Backward-compatible alias for the original calendar offset.
        coalesce(
            contract_base.cusip_contract_date,
            contract_base.contract_date_from_parts
        ) - coalesce(contract_base.trade_date_parsed, contract_base.sftp_date) as daily_contract_offset_days,

        -- Mon-Fri business-day offset from trade date to delivery date.
        -- Friday trade / Monday delivery is therefore D1, while true forward
        -- daily strips remain greater than one business day.
        case
            when coalesce(
                    contract_base.cusip_contract_date,
                    contract_base.contract_date_from_parts
                ) is null
                or coalesce(contract_base.trade_date_parsed, contract_base.sftp_date) is null
            then null
            when coalesce(
                    contract_base.cusip_contract_date,
                    contract_base.contract_date_from_parts
                ) >= coalesce(contract_base.trade_date_parsed, contract_base.sftp_date)
            then (
                select count(*)::integer
                from generate_series(
                    coalesce(contract_base.trade_date_parsed, contract_base.sftp_date) + interval '1 day',
                    coalesce(
                        contract_base.cusip_contract_date,
                        contract_base.contract_date_from_parts
                    ),
                    interval '1 day'
                ) as business_days(calendar_date)
                where extract(isodow from business_days.calendar_date)::integer between 1 and 5
            )
            else -1 * (
                select count(*)::integer
                from generate_series(
                    coalesce(
                        contract_base.cusip_contract_date,
                        contract_base.contract_date_from_parts
                    ) + interval '1 day',
                    coalesce(contract_base.trade_date_parsed, contract_base.sftp_date),
                    interval '1 day'
                ) as business_days(calendar_date)
                where extract(isodow from business_days.calendar_date)::integer between 1 and 5
            )
        end as daily_contract_business_offset_days,

        -- Monday-start week offset between trade week and delivery week.
        -- This supports PDP/PWA W0-W4 mapping. Other products are left null
        -- unless explicitly supported.
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

strike_base as (
    select
        strike_base_raw.*,
        case
            when strike_base_raw.strike_text_raw like '.%' then '0' || strike_base_raw.strike_text_raw
            when strike_base_raw.strike_text_raw like '-.%' then '-0' || substring(strike_base_raw.strike_text_raw from 2)
            else strike_base_raw.strike_text_raw
        end as strike_text
    from strike_base_raw
),

effective_product_base as (
    select
        strike_base.*,

        -- Clear Street can label PJM Western Hub day-ahead weekend deliveries
        -- as PDA in source/CUSIP. The effective ICE short-term weekend product
        -- is PDO, while the raw source fields remain available for audit.
        case
            when
                strike_base.product_code = 'PDA'
                and not strike_base.is_option
                and strike_base.daily_contract_date is not null
                and not strike_base.daily_contract_is_weekday
            then 'PDO'
            else strike_base.product_code
        end as product_code_effective
    from strike_base
),

export_base as (
    select
        effective_product_base.*,

        -- ICE codes cover IFED futures/options plus daily and weekly products.
        -- For short-term products, derive only symbols supported by the local
        -- PJM/ICE registries from Clear Street trade date and CUSIP date.
        case
            -- Weekend day-ahead rows map to the explicit PJM DA off-peak
            -- weekend short-term symbol.
            when
                effective_product_base.rule_exchange_name = 'IFED'
                and not effective_product_base.is_option
                and effective_product_base.product_code_effective = 'PDO'
                and effective_product_base.daily_contract_date is not null
                and not effective_product_base.daily_contract_is_weekday
            then 'PDO P1-IUS'

            -- Same-day RT daily products with exact symbols in the local ICE registry.
            when
                effective_product_base.rule_exchange_name = 'IFED'
                and not effective_product_base.is_option
                and effective_product_base.product_code_effective in ('PDP', 'PWA', 'DDP', 'ERA', 'END')
                and effective_product_base.daily_contract_is_weekday
                and effective_product_base.daily_contract_business_offset_days = 0
            then effective_product_base.product_code_effective || ' D0-IUS'

            -- Next-day daily products with exact symbols in the local ICE registry.
            -- Larger offsets may be weekly/forward strips and should not be
            -- forced into a D1 symbol.
            when
                effective_product_base.rule_exchange_name = 'IFED'
                and not effective_product_base.is_option
                and effective_product_base.product_code_effective in ('PDP', 'PWA', 'PDA', 'PJL', 'SDP', 'ERA', 'END', 'NEZ')
                and effective_product_base.daily_contract_is_weekday
                and effective_product_base.daily_contract_business_offset_days = 1
            then effective_product_base.product_code_effective || ' D1-IUS'

            -- PDP/PWA have weekly W0-W4 symbol patterns. Map only weekday
            -- delivery rows with a forward business offset greater than D1.
            when
                effective_product_base.rule_exchange_name = 'IFED'
                and not effective_product_base.is_option
                and effective_product_base.product_code_effective in ('PDP', 'PWA')
                and effective_product_base.daily_contract_is_weekday
                and effective_product_base.daily_contract_business_offset_days > 1
                and effective_product_base.daily_contract_week_offset between 0 and 4
            then effective_product_base.product_code_effective || ' W' || effective_product_base.daily_contract_week_offset::text || '-IUS'

            -- Henry Hub daily swing style code.
            when effective_product_base.rule_exchange_name = 'IFED' and effective_product_base.product_code_effective = 'HHD'
            then effective_product_base.product_code_effective || ' B0-IUS'

            -- ICE option symbols include product, month/year, put/call, and
            -- strike. Use strike_text so decimal strikes such as 3.75 are not
            -- rounded to whole numbers.
            when
                effective_product_base.rule_exchange_name = 'IFED'
                and effective_product_base.is_option
                and effective_product_base.put_call_code is not null
                and effective_product_base.strike_text is not null
                and effective_product_base.futures_month_code_yy is not null
            then effective_product_base.product_code_effective || ' ' || effective_product_base.futures_month_code_yy || effective_product_base.put_call_code
                || effective_product_base.strike_text || '-IUS'

            -- Standard monthly IFED futures.
            when
                effective_product_base.rule_exchange_name = 'IFED'
                and not effective_product_base.is_option
                and effective_product_base.contract_day is null
                and effective_product_base.futures_month_code_yy is not null
            then effective_product_base.product_code_effective || ' ' || effective_product_base.futures_month_code_yy || '-IUS'
        end as ice_product_code
    from effective_product_base
),

FINAL as (
    select
    export_base.*,

    -- CME Excel codes are emitted for NYMEX-routed rows and the PHE Excel
    -- exception. MUFG-specific models mask ICE-routed CME/BBG fields back to
    -- null so the handoff remains ICE-code only for ICE rows.
    -- Products outside this explicit list intentionally remain null until a
    -- verified vendor-code pattern is added.
    case
        when
            route_family = 'nymex'
            and product_code in ('HP', 'PHH', 'HH', 'H', 'NG')
            and contract_yyyymm is not null
        then '1|G|XNYM:F:NG:' || contract_yyyymm
        when
            route_family = 'nymex'
            and product_code = 'LN'
            and contract_yyyymm is not null
            and put_call_code is not null
            and strike_price_normalized is not null
        then '1|G|XNYM:O:LN:' || contract_yyyymm || ':' || put_call_code || ':' || strike_text
        when
            product_code = 'PHE'
            and contract_yyyymm is not null
            and put_call_code is not null
            and strike_price_normalized is not null
        then '1|G|XNYM:O:LN:' || contract_yyyymm || ':' || put_call_code || ':' || strike_text
        when
            route_family = 'nymex'
            and product_code in ('LN1', 'LN2', 'LN3', 'LN4', 'LN5')
            and contract_yyyymm is not null
            and put_call_code is not null
            and strike_price_normalized is not null
        then '1|G|XNYM:O:KN' || substring(product_code from 3) || ':'
            || contract_yyyymm || ':' || put_call_code || ':' || strike_text
        when
            route_family = 'nymex'
            and product_code in ('JN1', 'KN2', 'KN3', 'KN4')
            and contract_yyyymm is not null
            and put_call_code is not null
            and strike_price_normalized is not null
        then '1|G|XNYM:O:' || product_code || ':'
            || contract_yyyymm || ':' || put_call_code || ':' || strike_text
        when
            route_family = 'nymex'
            and product_code = 'G4'
            and contract_yyyymm is not null
            and put_call_code is not null
            and strike_price_normalized is not null
        then '1|G|XNYM:O:G4:' || contract_yyyymm || ':' || put_call_code || ':' || strike_text
    end as cme_product_code,

    -- Bloomberg codes depend on product-specific exchange prefixes.
    -- These mappings are intentionally narrow; unsupported products should
    -- stay null so review queries can find gaps instead of receiving invented
    -- Bloomberg symbols.
    case
        when
            route_family = 'nymex'
            and product_code = 'HP'
            and bbg_exchange_code = 'ZA'
            and futures_month_code_y is not null
        then bbg_exchange_code || futures_month_code_y || ' COMDTY'
        when
            route_family = 'nymex'
            and product_code = 'HH'
            and bbg_exchange_code = 'IW'
            and futures_month_code_y is not null
        then bbg_exchange_code || futures_month_code_y || ' COMDTY'
        when
            route_family = 'nymex'
            and product_code = 'NG'
            and bbg_exchange_code = 'NG'
            and futures_month_code_yy is not null
        then bbg_exchange_code || futures_month_code_yy || ' COMDTY'
        when
            route_family = 'nymex'
            and product_code = 'LN'
            and bbg_exchange_code = 'NG'
            and futures_month_code_y is not null
            and put_call_code is not null
            and strike_text is not null
        then bbg_exchange_code || futures_month_code_y || put_call_code || ' '
            || strike_text || ' COMDTY'
        when
            product_code = 'PHE'
            and futures_month_code_y is not null
            and put_call_code is not null
            and strike_text is not null
        then coalesce(bbg_exchange_code, 'NG') || futures_month_code_y || put_call_code || ' '
            || strike_text || ' COMDTY'
        when
            route_family = 'nymex'
            and product_code in ('LN1', 'LN2', 'LN3', 'LN4', 'LN5')
            and futures_month_code_yy is not null
            and put_call_code is not null
            and strike_text is not null
        then bbg_exchange_code || futures_month_code_yy || put_call_code
            || substring(product_code from 3) || ' ' || strike_text || ' COMB'
        when
            route_family = 'nymex'
            and product_code in ('JN1', 'KN2', 'KN3', 'KN4')
            and futures_month_code_yy is not null
            and put_call_code is not null
            and strike_text is not null
        then bbg_exchange_code || futures_month_code_yy || put_call_code
            || substring(product_code from 3) || ' ' || strike_text || ' Comdty'
        when
            route_family = 'nymex'
            and product_code = 'G4'
            and futures_month_code_y is not null
            and put_call_code is not null
            and strike_text is not null
        then coalesce(bbg_exchange_code, 'G4X') || futures_month_code_y || put_call_code
            || ' ' || strike_text || ' COMDTY'
    end as bbg_product_code
from export_base
)

select *
from FINAL
