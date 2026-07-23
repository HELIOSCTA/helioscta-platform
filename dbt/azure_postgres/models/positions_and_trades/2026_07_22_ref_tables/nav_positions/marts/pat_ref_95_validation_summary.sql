-- Positions/trades dbt validation summary for frontend health display.
--
-- Grain: one row per active validation check and validation scope. These
-- predicates intentionally mirror the data tests under
-- tests/positions_and_trades/2026_07_22_ref_tables and the drilldown model
-- pat_ref_96_validation_failures.

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
        clear_street_validation_rows.product_code::text as product_code,
        clear_street_validation_rows.product_code_grouping::text as product_grouping,
        clear_street_validation_rows.route_family::text as route_family,
        coalesce(clear_street_validation_rows.rule_status::text, '<null>') as failure_reason
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
        clear_street_vendor_prepared.product_code::text as product_code,
        clear_street_vendor_prepared.product_code_grouping::text as product_grouping,
        clear_street_vendor_prepared.vendor_route_family::text as route_family,
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
        end as failure_reason
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
        nav_validation_rows.product_code::text as product_code,
        nav_validation_rows.product_code_grouping::text as product_grouping,
        nav_validation_rows.route_family::text as route_family,
        coalesce(nav_validation_rows.rule_status::text, '<null>') as failure_reason
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
        nav_vendor_prepared.exchange_code::text as product_code,
        nav_vendor_prepared.exchange_code_grouping::text as product_grouping,
        nav_vendor_prepared.vendor_route_family::text as route_family,
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
        end as failure_reason
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

failure_rollups as (
    select
        all_failures.validation_scope,
        all_failures.check_id,
        count(*)::integer as failing_count,
        min(all_failures.source_date) as first_observed_date,
        max(all_failures.source_date) as last_observed_date
    from all_failures
    group by
        all_failures.validation_scope,
        all_failures.check_id
),

failure_groups as (
    select
        all_failures.validation_scope,
        all_failures.check_id,
        all_failures.product_code,
        all_failures.product_grouping,
        all_failures.route_family,
        all_failures.failure_reason,
        count(*)::integer as group_count,
        row_number() over (
            partition by
                all_failures.validation_scope,
                all_failures.check_id
            order by count(*) desc,
                all_failures.product_code nulls last,
                all_failures.product_grouping nulls last,
                all_failures.route_family nulls last
        ) as group_rank
    from all_failures
    group by
        all_failures.validation_scope,
        all_failures.check_id,
        all_failures.product_code,
        all_failures.product_grouping,
        all_failures.route_family,
        all_failures.failure_reason
),

top_failure_groups as (
    select
        failure_groups.validation_scope,
        failure_groups.check_id,
        failure_groups.product_code,
        failure_groups.product_grouping,
        failure_groups.route_family,
        failure_groups.failure_reason,
        failure_groups.group_count
    from failure_groups
    where failure_groups.group_rank = 1
),

summary as (
    select
        check_definitions.validation_scope,
        check_definitions.scope_label,
        check_definitions.check_id,
        check_definitions.check_label,
        check_definitions.source_system,
        check_definitions.severity,
        case
            when coalesce(failure_rollups.failing_count, 0) = 0 then 'pass'
            when check_definitions.severity = 'warn' then 'warn'
            else 'fail'
        end as status,
        coalesce(failure_rollups.failing_count, 0)::integer as failing_count,
        top_failure_groups.product_code as sample_product_code,
        top_failure_groups.product_grouping as sample_product_grouping,
        top_failure_groups.route_family as sample_route_family,
        top_failure_groups.failure_reason as sample_failure_reason,
        top_failure_groups.group_count as sample_group_count,
        failure_rollups.first_observed_date,
        failure_rollups.last_observed_date,
        check_definitions.sort_order
    from check_definitions
    left join failure_rollups
        on check_definitions.validation_scope = failure_rollups.validation_scope
       and check_definitions.check_id = failure_rollups.check_id
    left join top_failure_groups
        on check_definitions.validation_scope = top_failure_groups.validation_scope
       and check_definitions.check_id = top_failure_groups.check_id
),

FINAL as (
    select
        summary.validation_scope,
        summary.scope_label,
        summary.check_id,
        summary.check_label,
        summary.source_system,
        summary.severity,
        summary.status,
        summary.failing_count,
        case
            when summary.failing_count = 0 then 'No failing rows.'
            when summary.status = 'warn' then concat(
                summary.failing_count::text,
                ' warning row(s). Top group: ',
                coalesce(summary.sample_product_code, '<null>'),
                ' / ',
                coalesce(summary.sample_product_grouping, '<null>'),
                ' / ',
                coalesce(summary.sample_route_family, '<null>'),
                ' (',
                coalesce(summary.sample_failure_reason, 'unknown_reason'),
                ').'
            )
            else concat(
                summary.failing_count::text,
                ' failing row(s). Top group: ',
                coalesce(summary.sample_product_code, '<null>'),
                ' / ',
                coalesce(summary.sample_product_grouping, '<null>'),
                ' / ',
                coalesce(summary.sample_route_family, '<null>'),
                ' (',
                coalesce(summary.sample_failure_reason, 'unknown_reason'),
                ').'
            )
        end as detail,
        summary.sample_product_code,
        summary.sample_product_grouping,
        summary.sample_route_family,
        summary.sample_failure_reason,
        summary.sample_group_count,
        summary.first_observed_date,
        summary.last_observed_date,
        summary.sort_order
    from summary
)

select *
from FINAL
order by sort_order
