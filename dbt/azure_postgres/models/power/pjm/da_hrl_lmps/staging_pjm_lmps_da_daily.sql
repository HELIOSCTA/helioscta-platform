{{
  config(
    materialized='ephemeral'
  )
}}

----------------------------------
-- PJM DA daily LMPs.
-- Grain: 1 row per date x hub.
----------------------------------

{% set onpeak_start = 8 %}
{% set onpeak_end = 23 %}

WITH hourly AS (
    SELECT * FROM {{ ref('source_pjm_da_hrl_lmps') }}
)

SELECT
    date
    ,hub

    ,AVG(da_lmp_total) AS da_lmp_total_flat
    ,AVG(da_lmp_total) FILTER (WHERE hour_ending BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS da_lmp_total_onpeak
    ,AVG(da_lmp_total) FILTER (WHERE hour_ending NOT BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS da_lmp_total_offpeak

    ,AVG(da_lmp_system_energy_price) AS da_lmp_system_energy_price_flat
    ,AVG(da_lmp_system_energy_price) FILTER (WHERE hour_ending BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS da_lmp_system_energy_price_onpeak
    ,AVG(da_lmp_system_energy_price) FILTER (WHERE hour_ending NOT BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS da_lmp_system_energy_price_offpeak

    ,AVG(da_lmp_congestion_price) AS da_lmp_congestion_price_flat
    ,AVG(da_lmp_congestion_price) FILTER (WHERE hour_ending BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS da_lmp_congestion_price_onpeak
    ,AVG(da_lmp_congestion_price) FILTER (WHERE hour_ending NOT BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS da_lmp_congestion_price_offpeak

    ,AVG(da_lmp_marginal_loss_price) AS da_lmp_marginal_loss_price_flat
    ,AVG(da_lmp_marginal_loss_price) FILTER (WHERE hour_ending BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS da_lmp_marginal_loss_price_onpeak
    ,AVG(da_lmp_marginal_loss_price) FILTER (WHERE hour_ending NOT BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS da_lmp_marginal_loss_price_offpeak

    ,COUNT(*) AS hours_present_flat
    ,COUNT(*) FILTER (WHERE hour_ending BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS hours_present_onpeak
    ,COUNT(*) FILTER (WHERE hour_ending NOT BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS hours_present_offpeak

FROM hourly
GROUP BY date, hub
