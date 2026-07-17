{{
  config(
    materialized='ephemeral'
  )
}}

----------------------------------
-- PJM RT daily LMPs.
-- Grain: 1 row per date x hub.
----------------------------------

{% set onpeak_start = 8 %}
{% set onpeak_end = 23 %}

WITH hourly AS (
    SELECT * FROM {{ ref('source_pjm_rt_hrl_lmps') }}
)

SELECT
    date
    ,hub

    ,AVG(rt_lmp_total) AS rt_lmp_total_flat
    ,AVG(rt_lmp_total) FILTER (WHERE hour_ending BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS rt_lmp_total_onpeak
    ,AVG(rt_lmp_total) FILTER (WHERE hour_ending NOT BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS rt_lmp_total_offpeak

    ,AVG(rt_lmp_system_energy_price) AS rt_lmp_system_energy_price_flat
    ,AVG(rt_lmp_system_energy_price) FILTER (WHERE hour_ending BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS rt_lmp_system_energy_price_onpeak
    ,AVG(rt_lmp_system_energy_price) FILTER (WHERE hour_ending NOT BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS rt_lmp_system_energy_price_offpeak

    ,AVG(rt_lmp_congestion_price) AS rt_lmp_congestion_price_flat
    ,AVG(rt_lmp_congestion_price) FILTER (WHERE hour_ending BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS rt_lmp_congestion_price_onpeak
    ,AVG(rt_lmp_congestion_price) FILTER (WHERE hour_ending NOT BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS rt_lmp_congestion_price_offpeak

    ,AVG(rt_lmp_marginal_loss_price) AS rt_lmp_marginal_loss_price_flat
    ,AVG(rt_lmp_marginal_loss_price) FILTER (WHERE hour_ending BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS rt_lmp_marginal_loss_price_onpeak
    ,AVG(rt_lmp_marginal_loss_price) FILTER (WHERE hour_ending NOT BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS rt_lmp_marginal_loss_price_offpeak

    ,COUNT(*) AS hours_present_flat
    ,COUNT(*) FILTER (WHERE hour_ending BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS hours_present_onpeak
    ,COUNT(*) FILTER (WHERE hour_ending NOT BETWEEN {{ onpeak_start }} AND {{ onpeak_end }}) AS hours_present_offpeak

FROM hourly
GROUP BY date, hub
