with clear_street_exceptions as (
    select
        'clear_street' as source,
        trade_date_from_sftp as source_date,
        sftp_upload_timestamp,
        account_name,
        account_number as account,
        rule_product as source_product,
        product_code,
        product_family,
        market_name,
        rule_status,
        rule_match_source,
        null::text as rule_match_type,
        null::text as rule_match_pattern
    from {{ ref('cs_50_int_rules') }}
    where rule_status <> 'ok'
),

nav_exceptions as (
    select
        'nav' as source,
        nav_date::text as source_date,
        sftp_upload_timestamp,
        account_name,
        account,
        product as source_product,
        product_code,
        product_family,
        market_name,
        rule_status,
        null::text as rule_match_source,
        rule_match_type,
        rule_pattern as rule_match_pattern
    from {{ ref('nav_30_int_rules') }}
    where rule_status <> 'ok'
)

select * from clear_street_exceptions
union all
select * from nav_exceptions
order by source, source_date desc, rule_status, source_product
