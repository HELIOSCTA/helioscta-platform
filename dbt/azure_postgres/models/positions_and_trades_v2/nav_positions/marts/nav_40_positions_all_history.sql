select *
from {{ ref('nav_30_int_rules') }}
order by
    nav_date desc,
    sftp_upload_timestamp desc,
    fund_code,
    account_group,
    account,
    product_code,
    contract_yyyymm,
    contract_day
