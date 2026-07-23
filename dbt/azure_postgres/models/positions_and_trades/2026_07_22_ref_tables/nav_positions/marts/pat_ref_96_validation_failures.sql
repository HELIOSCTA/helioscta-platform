-- Positions/trades dbt validation failure rows for frontend drilldowns.
--
-- Grain: one row per validation failure and validation scope. The predicates
-- match the active product-matching gates and vendor-code warning checks used
-- by pat_ref_95_validation_summary.

with check_definitions as (
    select *
    from (
        values
            (
                'latest',
                'Latest Files',
                'clear_street_latest_product_matching',
                'Clear Street Latest Product Matching',
                'Clear Street',
                'error',
                10
            ),
            (
                'latest',
                'Latest Files',
                'clear_street_latest_vendor_codes_by_exchange_route',
                'Clear Street Latest Vendor Codes By Exchange Route',
                'Clear Street',
                'warn',
                20
            ),
            (
                'latest',
                'Latest Files',
                'nav_latest_product_matching',
                'NAV Latest Product Matching',
                'NAV',
                'error',
                30
            ),
            (
                'latest',
                'Latest Files',
                'nav_latest_vendor_codes_by_exchange_route',
                'NAV Latest Vendor Codes By Exchange Route',
                'NAV',
                'warn',
                40
            ),
            (
                'all_history',
                'All History',
                'clear_street_all_history_product_matching',
                'Clear Street All-History Product Matching',
                'Clear Street',
                'error',
                110
            ),
            (
                'all_history',
                'All History',
                'clear_street_all_history_vendor_codes_by_exchange_route',
                'Clear Street All-History Vendor Codes By Exchange Route',
                'Clear Street',
                'warn',
                120
            ),
            (
                'all_history',
                'All History',
                'nav_all_history_product_matching',
                'NAV All-History Product Matching',
                'NAV',
                'error',
                130
            ),
            (
                'all_history',
                'All History',
                'nav_all_history_vendor_codes_by_exchange_route',
                'NAV All-History Vendor Codes By Exchange Route',
                'NAV',
                'warn',
                140
            )
    ) as definitions (
        validation_scope,
        scope_label,
        check_id,
        check_label,
        source_system,
        severity,
        sort_order
    )
),

clear_street_all_history as (
    select * from {{ ref('cs_ref_65_eod_all_history') }}
),

nav_all_history as (
    select * from {{ ref('nav_ref_40_positions_all_history') }}
),

nav_vendor_rows as (
    select * from {{ ref('nav_ref_excel_20_positions_grouped') }}
),

clear_street_latest_file as (
    select
        clear_street_all_history.sftp_date,
        max(clear_street_all_history.sftp_upload_timestamp) as sftp_upload_timestamp
    from clear_street_all_history
    where clear_street_all_history.sftp_date = (
        select max(latest_dates.sftp_date)
        from clear_street_all_history as latest_dates
    )
    group by clear_street_all_history.sftp_date
),

clear_street_latest as (
    select clear_street_all_history.*
    from clear_street_all_history
    inner join clear_street_latest_file
        on clear_street_latest_file.sftp_date = clear_street_all_history.sftp_date
       and clear_street_latest_file.sftp_upload_timestamp = clear_street_all_history.sftp_upload_timestamp
),

clear_street_validation_rows as (
    select
        'latest'::text as validation_scope,
        clear_street_latest.*
    from clear_street_latest

    union all

    select
        'all_history'::text as validation_scope,
        clear_street_all_history.*
    from clear_street_all_history
),

clear_street_vendor_prepared as (
    select
        clear_street_validation_rows.*,
        upper(trim(coalesce(
            nullif(trim(clear_street_validation_rows.exchange_route_code::text), ''),
            nullif(trim(clear_street_validation_rows.exchange_name::text), ''),
            nullif(trim(clear_street_validation_rows.exchange::text), '')
        ))) as vendor_route_exchange,
        coalesce(
            nullif(trim(clear_street_validation_rows.route_family::text), ''),
            case
                when upper(trim(coalesce(
                    nullif(trim(clear_street_validation_rows.exchange_route_code::text), ''),
                    nullif(trim(clear_street_validation_rows.exchange_name::text), ''),
                    nullif(trim(clear_street_validation_rows.exchange::text), '')
                ))) in ('IFED', 'IFE', 'IPE') then 'ice'
                when upper(trim(coalesce(
                    nullif(trim(clear_street_validation_rows.exchange_route_code::text), ''),
                    nullif(trim(clear_street_validation_rows.exchange_name::text), ''),
                    nullif(trim(clear_street_validation_rows.exchange::text), '')
                ))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'nymex'
                when coalesce(
                    nullif(trim(clear_street_validation_rows.exchange_route_code::text), ''),
                    nullif(trim(clear_street_validation_rows.exchange_name::text), ''),
                    nullif(trim(clear_street_validation_rows.exchange::text), '')
                ) is null then 'missing'
                else 'unsupported'
            end
        ) as vendor_route_family
    from clear_street_validation_rows
),

nav_latest_dates_by_fund as (
    select
        nav_all_history.fund_code,
        max(nav_all_history.nav_date) as nav_date
    from nav_all_history
    group by nav_all_history.fund_code
),

nav_latest_files_by_fund as (
    select
        nav_all_history.fund_code,
        nav_all_history.nav_date,
        max(nav_all_history.sftp_upload_timestamp) as sftp_upload_timestamp
    from nav_all_history
    inner join nav_latest_dates_by_fund
        on nav_latest_dates_by_fund.fund_code = nav_all_history.fund_code
       and nav_latest_dates_by_fund.nav_date = nav_all_history.nav_date
    group by
        nav_all_history.fund_code,
        nav_all_history.nav_date
),

nav_latest as (
    select nav_all_history.*
    from nav_all_history
    inner join nav_latest_files_by_fund
        on nav_latest_files_by_fund.fund_code = nav_all_history.fund_code
       and nav_latest_files_by_fund.nav_date = nav_all_history.nav_date
       and nav_latest_files_by_fund.sftp_upload_timestamp = nav_all_history.sftp_upload_timestamp
),

nav_validation_rows as (
    select
        'latest'::text as validation_scope,
        nav_latest.*
    from nav_latest

    union all

    select
        'all_history'::text as validation_scope,
        nav_all_history.*
    from nav_all_history
),

nav_vendor_latest_date as (
    select max(nav_vendor_rows.sftp_date) as sftp_date
    from nav_vendor_rows
),

nav_vendor_latest_rows as (
    select nav_vendor_rows.*
    from nav_vendor_rows
    inner join nav_vendor_latest_date
        on nav_vendor_latest_date.sftp_date = nav_vendor_rows.sftp_date
),

nav_vendor_validation_rows as (
    select
        'latest'::text as validation_scope,
        nav_vendor_latest_rows.*
    from nav_vendor_latest_rows

    union all

    select
        'all_history'::text as validation_scope,
        nav_vendor_rows.*
    from nav_vendor_rows
),

nav_vendor_prepared as (
    select
        nav_vendor_validation_rows.*,
        upper(trim(coalesce(
            nullif(trim(nav_vendor_validation_rows.exchange_route_code::text), ''),
            nullif(trim(nav_vendor_validation_rows.exchange_name::text), '')
        ))) as vendor_route_exchange,
        coalesce(
            nullif(trim(nav_vendor_validation_rows.route_family::text), ''),
            case
                when upper(trim(coalesce(
                    nullif(trim(nav_vendor_validation_rows.exchange_route_code::text), ''),
                    nullif(trim(nav_vendor_validation_rows.exchange_name::text), '')
                ))) in ('IFED', 'IFE', 'IPE') then 'ice'
                when upper(trim(coalesce(
                    nullif(trim(nav_vendor_validation_rows.exchange_route_code::text), ''),
                    nullif(trim(nav_vendor_validation_rows.exchange_name::text), '')
                ))) in ('NYME', 'NYM', 'NYMEX', 'NMY') then 'nymex'
                when coalesce(
                    nullif(trim(nav_vendor_validation_rows.exchange_route_code::text), ''),
                    nullif(trim(nav_vendor_validation_rows.exchange_name::text), '')
                ) is null then 'missing'
                else 'unsupported'
            end
        ) as vendor_route_family
    from nav_vendor_validation_rows
),

clear_street_product_matching_failures as (
    select
        clear_street_validation_rows.validation_scope,
        case
            when clear_street_validation_rows.validation_scope = 'latest'
            then 'clear_street_latest_product_matching'
            else 'clear_street_all_history_product_matching'
        end as check_id,
        coalesce(
            clear_street_validation_rows.trade_date_from_sftp::text,
            clear_street_validation_rows.sftp_date::text
        ) as source_date,
        null::text as source_file_name,
        clear_street_validation_rows.sftp_upload_timestamp::text as sftp_upload_timestamp,
        concat_ws(
            ':',
            clear_street_validation_rows.trade_date_from_sftp::text,
            clear_street_validation_rows.sftp_upload_timestamp::text,
            clear_street_validation_rows.row_number_for_trades::text,
            clear_street_validation_rows.record_id::text
        ) as source_record_key,
        clear_street_validation_rows.row_number_for_trades::text as source_row_number,
        clear_street_validation_rows.account_code::text,
        clear_street_validation_rows.account_name::text,
        clear_street_validation_rows.account_number::text as source_account,
        coalesce(
            nullif(trim(clear_street_validation_rows.security_description::text), ''),
            nullif(trim(clear_street_validation_rows.instrument_description::text), ''),
            nullif(trim(clear_street_validation_rows.symbol::text), ''),
            nullif(trim(clear_street_validation_rows.futures_code::text), ''),
            nullif(trim(clear_street_validation_rows.exch_comm_cd::text), '')
        ) as source_product,
        clear_street_validation_rows.product_code::text,
        clear_street_validation_rows.product_code_grouping::text as product_grouping,
        clear_street_validation_rows.product_code_region::text as product_region,
        clear_street_validation_rows.contract_yyyymm::text,
        clear_street_validation_rows.contract_day::text,
        clear_street_validation_rows.put_call_code::text as put_call,
        clear_street_validation_rows.strike_price_normalized::text as strike_price,
        upper(trim(coalesce(
            nullif(trim(clear_street_validation_rows.exchange_route_code::text), ''),
            nullif(trim(clear_street_validation_rows.exchange_name::text), ''),
            nullif(trim(clear_street_validation_rows.exchange::text), '')
        ))) as route_exchange,
        clear_street_validation_rows.route_family::text,
        clear_street_validation_rows.source_exchange_name::text,
        clear_street_validation_rows.exchange::text as raw_exchange,
        clear_street_validation_rows.ice_product_code::text as vendor_ice_code,
        clear_street_validation_rows.cme_product_code::text as vendor_cme_code,
        clear_street_validation_rows.bbg_product_code::text as vendor_bbg_code,
        coalesce(clear_street_validation_rows.rule_status::text, '<null>') as failure_reason,
        concat_ws(
            ' | ',
            nullif(trim(clear_street_validation_rows.trade_type::text), ''),
            nullif(trim(clear_street_validation_rows.security_type_code::text), ''),
            nullif(trim(clear_street_validation_rows.comment_code::text), '')
        ) as source_context
    from clear_street_validation_rows
    where clear_street_validation_rows.rule_status is distinct from 'ok'
      and clear_street_validation_rows.rule_status is distinct from 'non_product_cash_adjustment'
),

clear_street_vendor_code_failures as (
    select
        clear_street_vendor_prepared.validation_scope,
        case
            when clear_street_vendor_prepared.validation_scope = 'latest'
            then 'clear_street_latest_vendor_codes_by_exchange_route'
            else 'clear_street_all_history_vendor_codes_by_exchange_route'
        end as check_id,
        coalesce(
            clear_street_vendor_prepared.trade_date_from_sftp::text,
            clear_street_vendor_prepared.sftp_date::text
        ) as source_date,
        null::text as source_file_name,
        clear_street_vendor_prepared.sftp_upload_timestamp::text as sftp_upload_timestamp,
        concat_ws(
            ':',
            clear_street_vendor_prepared.trade_date_from_sftp::text,
            clear_street_vendor_prepared.sftp_upload_timestamp::text,
            clear_street_vendor_prepared.row_number_for_trades::text,
            clear_street_vendor_prepared.record_id::text
        ) as source_record_key,
        clear_street_vendor_prepared.row_number_for_trades::text as source_row_number,
        clear_street_vendor_prepared.account_code::text,
        clear_street_vendor_prepared.account_name::text,
        clear_street_vendor_prepared.account_number::text as source_account,
        coalesce(
            nullif(trim(clear_street_vendor_prepared.security_description::text), ''),
            nullif(trim(clear_street_vendor_prepared.instrument_description::text), ''),
            nullif(trim(clear_street_vendor_prepared.symbol::text), ''),
            nullif(trim(clear_street_vendor_prepared.futures_code::text), ''),
            nullif(trim(clear_street_vendor_prepared.exch_comm_cd::text), '')
        ) as source_product,
        clear_street_vendor_prepared.product_code::text,
        clear_street_vendor_prepared.product_code_grouping::text as product_grouping,
        clear_street_vendor_prepared.product_code_region::text as product_region,
        clear_street_vendor_prepared.contract_yyyymm::text,
        clear_street_vendor_prepared.contract_day::text,
        clear_street_vendor_prepared.put_call_code::text as put_call,
        clear_street_vendor_prepared.strike_price_normalized::text as strike_price,
        clear_street_vendor_prepared.vendor_route_exchange::text as route_exchange,
        clear_street_vendor_prepared.vendor_route_family::text as route_family,
        clear_street_vendor_prepared.source_exchange_name::text,
        clear_street_vendor_prepared.exchange::text as raw_exchange,
        clear_street_vendor_prepared.ice_product_code::text as vendor_ice_code,
        clear_street_vendor_prepared.cme_product_code::text as vendor_cme_code,
        clear_street_vendor_prepared.bbg_product_code::text as vendor_bbg_code,
        case
            when nullif(trim(clear_street_vendor_prepared.product_code_grouping::text), '') is null
            then 'missing_product_code_grouping'
            when clear_street_vendor_prepared.vendor_route_family in ('missing', 'unsupported')
            then 'missing_or_unsupported_route_family'
            when clear_street_vendor_prepared.vendor_route_family not in ('ice', 'nymex')
            then 'invalid_route_family'
            when
                clear_street_vendor_prepared.vendor_route_family = 'ice'
                and nullif(trim(clear_street_vendor_prepared.ice_product_code::text), '') is null
            then 'missing_ice_product_code'
            when
                clear_street_vendor_prepared.vendor_route_family = 'nymex'
                and nullif(trim(clear_street_vendor_prepared.cme_product_code::text), '') is null
                and nullif(trim(clear_street_vendor_prepared.bbg_product_code::text), '') is null
            then 'missing_nymex_cme_or_bbg_code'
        end as failure_reason,
        concat_ws(
            ' | ',
            nullif(trim(clear_street_vendor_prepared.trade_type::text), ''),
            nullif(trim(clear_street_vendor_prepared.security_type_code::text), ''),
            nullif(trim(clear_street_vendor_prepared.comment_code::text), '')
        ) as source_context
    from clear_street_vendor_prepared
    where coalesce(clear_street_vendor_prepared.is_product_record, true)
      and (
        nullif(trim(clear_street_vendor_prepared.product_code_grouping::text), '') is null
       or clear_street_vendor_prepared.vendor_route_family in ('missing', 'unsupported')
       or clear_street_vendor_prepared.vendor_route_family not in ('ice', 'nymex')
       or (
            clear_street_vendor_prepared.vendor_route_family = 'ice'
            and nullif(trim(clear_street_vendor_prepared.ice_product_code::text), '') is null
        )
       or (
            clear_street_vendor_prepared.vendor_route_family = 'nymex'
            and nullif(trim(clear_street_vendor_prepared.cme_product_code::text), '') is null
            and nullif(trim(clear_street_vendor_prepared.bbg_product_code::text), '') is null
        )
    )
),

nav_product_matching_failures as (
    select
        nav_validation_rows.validation_scope,
        case
            when nav_validation_rows.validation_scope = 'latest'
            then 'nav_latest_product_matching'
            else 'nav_all_history_product_matching'
        end as check_id,
        nav_validation_rows.nav_date::text as source_date,
        nav_validation_rows.source_file_name::text,
        nav_validation_rows.sftp_upload_timestamp::text,
        concat_ws(
            ':',
            nav_validation_rows.fund_code::text,
            nav_validation_rows.source_file_name::text,
            nav_validation_rows.source_file_row_number::text
        ) as source_record_key,
        nav_validation_rows.source_file_row_number::text as source_row_number,
        nav_validation_rows.account_code::text,
        nav_validation_rows.account_name::text,
        nav_validation_rows.account::text as source_account,
        nav_validation_rows.product::text as source_product,
        nav_validation_rows.product_code::text,
        nav_validation_rows.product_code_grouping::text as product_grouping,
        nav_validation_rows.product_code_region::text as product_region,
        nav_validation_rows.contract_yyyymm::text,
        nav_validation_rows.contract_day::text,
        nav_validation_rows.put_call_code::text as put_call,
        nav_validation_rows.strike_price_normalized::text as strike_price,
        upper(trim(coalesce(
            nullif(trim(nav_validation_rows.exchange_route_code::text), ''),
            nullif(trim(nav_validation_rows.exchange_name::text), '')
        ))) as route_exchange,
        nav_validation_rows.route_family::text,
        nav_validation_rows.source_exchange_name::text,
        nav_validation_rows.exchange_name::text as raw_exchange,
        null::text as vendor_ice_code,
        null::text as vendor_cme_code,
        null::text as vendor_bbg_code,
        coalesce(nav_validation_rows.rule_status::text, '<null>') as failure_reason,
        concat_ws(
            ' | ',
            nullif(trim(nav_validation_rows.fund_code::text), ''),
            nullif(trim(nav_validation_rows.type::text), ''),
            nullif(trim(nav_validation_rows.client_symbol::text), '')
        ) as source_context
    from nav_validation_rows
    where nav_validation_rows.rule_status is distinct from 'ok'
),

nav_vendor_code_failures as (
    select
        nav_vendor_prepared.validation_scope,
        case
            when nav_vendor_prepared.validation_scope = 'latest'
            then 'nav_latest_vendor_codes_by_exchange_route'
            else 'nav_all_history_vendor_codes_by_exchange_route'
        end as check_id,
        nav_vendor_prepared.sftp_date::text as source_date,
        null::text as source_file_name,
        null::text as sftp_upload_timestamp,
        nav_vendor_prepared.position_group_key::text as source_record_key,
        null::text as source_row_number,
        null::text as account_code,
        null::text as account_name,
        null::text as source_account,
        coalesce(
            nullif(trim(nav_vendor_prepared.marex_description::text), ''),
            nullif(trim(nav_vendor_prepared.exchange_code::text), '')
        ) as source_product,
        nav_vendor_prepared.exchange_code::text as product_code,
        nav_vendor_prepared.exchange_code_grouping::text as product_grouping,
        nav_vendor_prepared.exchange_code_region::text as product_region,
        nav_vendor_prepared.contract_yyyymm::text,
        nav_vendor_prepared.contract_day::text,
        nav_vendor_prepared.put_call::text,
        nav_vendor_prepared.strike_price::text,
        nav_vendor_prepared.vendor_route_exchange::text as route_exchange,
        nav_vendor_prepared.vendor_route_family::text as route_family,
        nav_vendor_prepared.exchange_name::text as source_exchange_name,
        nav_vendor_prepared.exchange_name::text as raw_exchange,
        nav_vendor_prepared.ice_xl_symbol::text as vendor_ice_code,
        nav_vendor_prepared.cme_excel_symbol::text as vendor_cme_code,
        nav_vendor_prepared.bbg_option_description::text as vendor_bbg_code,
        case
            when nullif(trim(nav_vendor_prepared.exchange_code_grouping::text), '') is null
            then 'missing_product_code_grouping'
            when nav_vendor_prepared.vendor_route_family in ('missing', 'unsupported')
            then 'missing_or_unsupported_route_family'
            when nav_vendor_prepared.vendor_route_family not in ('ice', 'nymex')
            then 'invalid_route_family'
            when
                nav_vendor_prepared.vendor_route_family = 'ice'
                and nullif(trim(nav_vendor_prepared.ice_xl_symbol::text), '') is null
            then 'missing_ice_xl_symbol'
            when
                nav_vendor_prepared.vendor_route_family = 'nymex'
                and nullif(trim(nav_vendor_prepared.cme_excel_symbol::text), '') is null
                and nullif(trim(nav_vendor_prepared.bbg_option_description::text), '') is null
            then 'missing_nymex_excel_or_bbg_code'
        end as failure_reason,
        concat_ws(
            ' | ',
            concat('qty=', coalesce(nav_vendor_prepared.qty_total::text, '<null>')),
            concat('lots=', coalesce(nav_vendor_prepared.lots::text, '<null>'))
        ) as source_context
    from nav_vendor_prepared
    where coalesce(nav_vendor_prepared.is_product_record, true)
      and (
        nullif(trim(nav_vendor_prepared.exchange_code_grouping::text), '') is null
       or nav_vendor_prepared.vendor_route_family in ('missing', 'unsupported')
       or nav_vendor_prepared.vendor_route_family not in ('ice', 'nymex')
       or (
            nav_vendor_prepared.vendor_route_family = 'ice'
            and nullif(trim(nav_vendor_prepared.ice_xl_symbol::text), '') is null
        )
       or (
            nav_vendor_prepared.vendor_route_family = 'nymex'
            and nullif(trim(nav_vendor_prepared.cme_excel_symbol::text), '') is null
            and nullif(trim(nav_vendor_prepared.bbg_option_description::text), '') is null
        )
    )
),

all_failures as (
    select * from clear_street_product_matching_failures
    union all
    select * from clear_street_vendor_code_failures
    union all
    select * from nav_product_matching_failures
    union all
    select * from nav_vendor_code_failures
),

FINAL as (
    select
        check_definitions.validation_scope,
        check_definitions.scope_label,
        check_definitions.check_id,
        check_definitions.check_label,
        check_definitions.source_system,
        check_definitions.severity,
        all_failures.source_date,
        all_failures.source_file_name,
        all_failures.sftp_upload_timestamp,
        all_failures.source_record_key,
        all_failures.source_row_number,
        all_failures.account_code,
        all_failures.account_name,
        all_failures.source_account,
        all_failures.source_product,
        all_failures.product_code,
        all_failures.product_grouping,
        all_failures.product_region,
        all_failures.contract_yyyymm,
        all_failures.contract_day,
        all_failures.put_call,
        all_failures.strike_price,
        all_failures.route_exchange,
        all_failures.route_family,
        all_failures.source_exchange_name,
        all_failures.raw_exchange,
        all_failures.vendor_ice_code,
        all_failures.vendor_cme_code,
        all_failures.vendor_bbg_code,
        all_failures.failure_reason,
        all_failures.source_context,
        check_definitions.sort_order
    from all_failures
    inner join check_definitions
        on check_definitions.validation_scope = all_failures.validation_scope
       and check_definitions.check_id = all_failures.check_id
)

select *
from FINAL
