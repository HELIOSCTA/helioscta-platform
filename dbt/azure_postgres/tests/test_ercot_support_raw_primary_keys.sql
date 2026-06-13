WITH key_issues AS (
    SELECT 'actual_system_load' AS table_name, operatingday::text || '|' || hourending::text AS key_value, COUNT(*) AS row_count
    FROM "{{ target.database }}"."ercot"."actual_system_load"
    WHERE operatingday IS NULL OR hourending IS NULL
    GROUP BY 1, 2
    UNION ALL
    SELECT 'actual_system_load', operatingday::text || '|' || hourending::text, COUNT(*)
    FROM "{{ target.database }}"."ercot"."actual_system_load"
    GROUP BY 1, 2
    HAVING COUNT(*) > 1

    UNION ALL
    SELECT 'seven_day_load_forecast', posteddatetime::text || '|' || deliverydate::text || '|' || hourending::text || '|' || model, COUNT(*)
    FROM "{{ target.database }}"."ercot"."seven_day_load_forecast"
    WHERE posteddatetime IS NULL OR deliverydate IS NULL OR hourending IS NULL OR model IS NULL
    GROUP BY 1, 2
    UNION ALL
    SELECT 'seven_day_load_forecast', posteddatetime::text || '|' || deliverydate::text || '|' || hourending::text || '|' || model, COUNT(*)
    FROM "{{ target.database }}"."ercot"."seven_day_load_forecast"
    GROUP BY 1, 2
    HAVING COUNT(*) > 1

    UNION ALL
    SELECT 'dam_shadow_prices', deliverytime::text || '|' || constraintid::text || '|' || constraintname || '|' || contingencyname, COUNT(*)
    FROM "{{ target.database }}"."ercot"."dam_shadow_prices"
    WHERE deliverytime IS NULL OR constraintid IS NULL OR constraintname IS NULL OR contingencyname IS NULL
    GROUP BY 1, 2
    UNION ALL
    SELECT 'dam_shadow_prices', deliverytime::text || '|' || constraintid::text || '|' || constraintname || '|' || contingencyname, COUNT(*)
    FROM "{{ target.database }}"."ercot"."dam_shadow_prices"
    GROUP BY 1, 2
    HAVING COUNT(*) > 1

    UNION ALL
    SELECT 'sced_shadow_prices', scedtimestamp::text || '|' || constraintid::text || '|' || constraintname || '|' || contingencyname, COUNT(*)
    FROM "{{ target.database }}"."ercot"."sced_shadow_prices"
    WHERE scedtimestamp IS NULL OR constraintid IS NULL OR constraintname IS NULL OR contingencyname IS NULL
    GROUP BY 1, 2
    UNION ALL
    SELECT 'sced_shadow_prices', scedtimestamp::text || '|' || constraintid::text || '|' || constraintname || '|' || contingencyname, COUNT(*)
    FROM "{{ target.database }}"."ercot"."sced_shadow_prices"
    GROUP BY 1, 2
    HAVING COUNT(*) > 1

    UNION ALL
    SELECT 'wind_power_production_hourly', posteddatetime::text || '|' || deliverydate::text || '|' || hourending::text, COUNT(*)
    FROM "{{ target.database }}"."ercot"."wind_power_production_hourly"
    WHERE posteddatetime IS NULL OR deliverydate IS NULL OR hourending IS NULL
    GROUP BY 1, 2
    UNION ALL
    SELECT 'wind_power_production_hourly', posteddatetime::text || '|' || deliverydate::text || '|' || hourending::text, COUNT(*)
    FROM "{{ target.database }}"."ercot"."wind_power_production_hourly"
    GROUP BY 1, 2
    HAVING COUNT(*) > 1

    UNION ALL
    SELECT 'solar_power_production_hourly', posteddatetime::text || '|' || deliverydate::text || '|' || hourending::text, COUNT(*)
    FROM "{{ target.database }}"."ercot"."solar_power_production_hourly"
    WHERE posteddatetime IS NULL OR deliverydate IS NULL OR hourending IS NULL
    GROUP BY 1, 2
    UNION ALL
    SELECT 'solar_power_production_hourly', posteddatetime::text || '|' || deliverydate::text || '|' || hourending::text, COUNT(*)
    FROM "{{ target.database }}"."ercot"."solar_power_production_hourly"
    GROUP BY 1, 2
    HAVING COUNT(*) > 1

    UNION ALL
    SELECT 'wind_power_actual_5min', posteddatetime::text || '|' || intervalending::text, COUNT(*)
    FROM "{{ target.database }}"."ercot"."wind_power_actual_5min"
    WHERE posteddatetime IS NULL OR intervalending IS NULL
    GROUP BY 1, 2
    UNION ALL
    SELECT 'wind_power_actual_5min', posteddatetime::text || '|' || intervalending::text, COUNT(*)
    FROM "{{ target.database }}"."ercot"."wind_power_actual_5min"
    GROUP BY 1, 2
    HAVING COUNT(*) > 1

    UNION ALL
    SELECT 'solar_power_actual_5min', posteddatetime::text || '|' || intervalending::text, COUNT(*)
    FROM "{{ target.database }}"."ercot"."solar_power_actual_5min"
    WHERE posteddatetime IS NULL OR intervalending IS NULL
    GROUP BY 1, 2
    UNION ALL
    SELECT 'solar_power_actual_5min', posteddatetime::text || '|' || intervalending::text, COUNT(*)
    FROM "{{ target.database }}"."ercot"."solar_power_actual_5min"
    GROUP BY 1, 2
    HAVING COUNT(*) > 1

    UNION ALL
    SELECT 'hourly_resource_outage_capacity', posteddatetime::text || '|' || operatingdate::text || '|' || hourending::text, COUNT(*)
    FROM "{{ target.database }}"."ercot"."hourly_resource_outage_capacity"
    WHERE posteddatetime IS NULL OR operatingdate IS NULL OR hourending IS NULL
    GROUP BY 1, 2
    UNION ALL
    SELECT 'hourly_resource_outage_capacity', posteddatetime::text || '|' || operatingdate::text || '|' || hourending::text, COUNT(*)
    FROM "{{ target.database }}"."ercot"."hourly_resource_outage_capacity"
    GROUP BY 1, 2
    HAVING COUNT(*) > 1

    UNION ALL
    SELECT 'short_term_system_adequacy', posteddatetime::text || '|' || deliverydate::text || '|' || hourending::text || '|' || repeathourflag::text, COUNT(*)
    FROM "{{ target.database }}"."ercot"."short_term_system_adequacy"
    WHERE posteddatetime IS NULL OR deliverydate IS NULL OR hourending IS NULL OR repeathourflag IS NULL
    GROUP BY 1, 2
    UNION ALL
    SELECT 'short_term_system_adequacy', posteddatetime::text || '|' || deliverydate::text || '|' || hourending::text || '|' || repeathourflag::text, COUNT(*)
    FROM "{{ target.database }}"."ercot"."short_term_system_adequacy"
    GROUP BY 1, 2
    HAVING COUNT(*) > 1
)

SELECT *
FROM key_issues
