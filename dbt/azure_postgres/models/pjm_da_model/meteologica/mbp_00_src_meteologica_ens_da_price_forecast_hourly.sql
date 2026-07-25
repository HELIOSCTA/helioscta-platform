{{
  config(
    materialized='ephemeral'
  )
}}

with source_rows as (
    select * from {{ source('meteologica', 'usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly') }}
),

FINAL as (
    select
        content_id,
        content_name,
        update_id,
        issue_date,
        source_timezone,
        source_unit,
        forecast_period_start,
        forecast_period_end,
        average_price::float8 as average_price,
        bottom_price::float8 as bottom_price,
        top_price::float8 as top_price,
        ens_00_price::float8 as ens_00_price,
        ens_01_price::float8 as ens_01_price,
        ens_02_price::float8 as ens_02_price,
        ens_03_price::float8 as ens_03_price,
        ens_04_price::float8 as ens_04_price,
        ens_05_price::float8 as ens_05_price,
        ens_06_price::float8 as ens_06_price,
        ens_07_price::float8 as ens_07_price,
        ens_08_price::float8 as ens_08_price,
        ens_09_price::float8 as ens_09_price,
        ens_10_price::float8 as ens_10_price,
        ens_11_price::float8 as ens_11_price,
        ens_12_price::float8 as ens_12_price,
        ens_13_price::float8 as ens_13_price,
        ens_14_price::float8 as ens_14_price,
        ens_15_price::float8 as ens_15_price,
        ens_16_price::float8 as ens_16_price,
        ens_17_price::float8 as ens_17_price,
        ens_18_price::float8 as ens_18_price,
        ens_19_price::float8 as ens_19_price,
        ens_20_price::float8 as ens_20_price,
        ens_21_price::float8 as ens_21_price,
        ens_22_price::float8 as ens_22_price,
        ens_23_price::float8 as ens_23_price,
        ens_24_price::float8 as ens_24_price,
        ens_25_price::float8 as ens_25_price,
        ens_26_price::float8 as ens_26_price,
        ens_27_price::float8 as ens_27_price,
        ens_28_price::float8 as ens_28_price,
        ens_29_price::float8 as ens_29_price,
        ens_30_price::float8 as ens_30_price,
        ens_31_price::float8 as ens_31_price,
        ens_32_price::float8 as ens_32_price,
        ens_33_price::float8 as ens_33_price,
        ens_34_price::float8 as ens_34_price,
        ens_35_price::float8 as ens_35_price,
        ens_36_price::float8 as ens_36_price,
        ens_37_price::float8 as ens_37_price,
        ens_38_price::float8 as ens_38_price,
        ens_39_price::float8 as ens_39_price,
        ens_40_price::float8 as ens_40_price,
        ens_41_price::float8 as ens_41_price,
        ens_42_price::float8 as ens_42_price,
        ens_43_price::float8 as ens_43_price,
        ens_44_price::float8 as ens_44_price,
        ens_45_price::float8 as ens_45_price,
        ens_46_price::float8 as ens_46_price,
        ens_47_price::float8 as ens_47_price,
        ens_48_price::float8 as ens_48_price,
        ens_49_price::float8 as ens_49_price,
        ens_50_price::float8 as ens_50_price,
        updated_at
    from source_rows
)

select *
from FINAL
