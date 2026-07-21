SET IDENTITY_INSERT [natgas].[source] ON
GO
INSERT [natgas].[source] ([source_id], [source_name], [source_type], [load_type], [load_proc], [source_path])
SELECT source_id, source_name, source_type, load_type, load_proc, source_path
FROM (VALUES
  (1, N'gasdatafeed_metadata', 'metadata', 'multi-file', 'natgas.usp_upsert_gasdatafeed_metadata', N'https://apps.genscape.com/gasdatafeed/v3/csv/metadata/')

, (2, N'gas_burn', 'baseline', 'incremental', 'natgas.usp_upsert_gasdatafeed_gas_burn', N'https://apps.genscape.com/gasdatafeed/v3/csv/gas_burn/baseline/')
, (3, N'no_notice', 'baseline', 'incremental', 'natgas.usp_upsert_gasdatafeed_no_notice', N'https://apps.genscape.com/gasdatafeed/v3/csv/no_notice/baseline/')
, (4, N'nominations', 'baseline', 'incremental', 'natgas.usp_upsert_gasdatafeed_nominations', N'https://apps.genscape.com/gasdatafeed/v3/csv/nominations/baseline/')
, (5, N'gas_quality', 'baseline', 'incremental', 'natgas.usp_upsert_gasdatafeed_gas_quality', N'https://apps.genscape.com/gasdatafeed/v3/csv/gas_quality/baseline/')
, (6, N'all_cycles', 'baseline', 'incremental', 'natgas.usp_upsert_gasdatafeed_all_cycles', N'https://apps.genscape.com/gasdatafeed/v3/csv/all_cycles/baseline/')

, (7, N'gas_burn', 'daily', 'incremental', 'natgas.usp_upsert_gasdatafeed_gas_burn', N'https://apps.genscape.com/gasdatafeed/v3/csv/gas_burn/daily/')
, (8, N'no_notice', 'daily', 'incremental', 'natgas.usp_upsert_gasdatafeed_no_notice', N'https://apps.genscape.com/gasdatafeed/v3/csv/no_notice/daily/')
, (9, N'nominations', 'daily', 'incremental', 'natgas.usp_upsert_gasdatafeed_nominations', N'https://apps.genscape.com/gasdatafeed/v3/csv/nominations/daily/')
, (10, N'gas_quality', 'daily', 'incremental', 'natgas.usp_upsert_gasdatafeed_gas_quality', N'https://apps.genscape.com/gasdatafeed/v3/csv/gas_quality/daily/')
, (11, N'all_cycles', 'daily', 'incremental', 'natgas.usp_upsert_gasdatafeed_all_cycles', N'https://apps.genscape.com/gasdatafeed/v3/csv/all_cycles/daily/')

, (12, N'gas_burn', 'bidaily', 'incremental', 'natgas.usp_upsert_gasdatafeed_gas_burn', N'https://apps.genscape.com/gasdatafeed/v3/csv/gas_burn/bidaily/')
, (13, N'no_notice', 'bidaily', 'incremental', 'natgas.usp_upsert_gasdatafeed_no_notice', N'https://apps.genscape.com/gasdatafeed/v3/csv/no_notice/bidaily/')
, (14, N'nominations', 'bidaily', 'incremental', 'natgas.usp_upsert_gasdatafeed_nominations', N'https://apps.genscape.com/gasdatafeed/v3/csv/nominations/bidaily/')
, (15, N'gas_quality', 'bidaily', 'incremental', 'natgas.usp_upsert_gasdatafeed_gas_quality', N'https://apps.genscape.com/gasdatafeed/v3/csv/gas_quality/bidaily/')
, (16, N'all_cycles', 'bidaily', 'incremental', 'natgas.usp_upsert_gasdatafeed_all_cycles', N'https://apps.genscape.com/gasdatafeed/v3/csv/all_cycles/bidaily/')

, (17, N'gas_burn', 'hourly', 'incremental', 'natgas.usp_upsert_gasdatafeed_gas_burn', N'https://apps.genscape.com/gasdatafeed/v3/csv/gas_burn/hourly/')
, (18, N'no_notice', 'hourly', 'incremental', 'natgas.usp_upsert_gasdatafeed_no_notice', N'https://apps.genscape.com/gasdatafeed/v3/csv/no_notice/hourly/')
, (19, N'nominations', 'hourly', 'incremental', 'natgas.usp_upsert_gasdatafeed_nominations', N'https://apps.genscape.com/gasdatafeed/v3/csv/nominations/hourly/')
, (20, N'gas_quality', 'hourly', 'incremental', 'natgas.usp_upsert_gasdatafeed_gas_quality', N'https://apps.genscape.com/gasdatafeed/v3/csv/gas_quality/hourly/')
, (21, N'all_cycles', 'hourly', 'incremental', 'natgas.usp_upsert_gasdatafeed_all_cycles', N'https://apps.genscape.com/gasdatafeed/v3/csv/all_cycles/hourly/')

, (22, N'pipeline_inventory', 'hourly', 'single', 'natgas.usp_upsert_gasdatafeed_pipeline_inventory', N'https://apps.genscape.com/gasdatafeed/v3/csv/pipeline_inventory/daily/')
, (23, N'proprietary_metadata', 'metadata', 'multi-file', 'natgas.usp_upsert_proprietary_metadata', N'https://apps.genscape.com/gasproprietary/metadata/daily/')

, (24, N'intrastate_storage', 'hourly', 'multi-file', 'natgas.usp_upsert_proprietary_intrastate_storage', N'https://apps.genscape.com/gasproprietary/intrastate_storage/daily/')
, (25, N'mexico_exports', 'hourly', 'multi-file', 'natgas.usp_upsert_proprietary_mexico_exports', N'https://apps.genscape.com/gasproprietary/mexico_exports/daily/')
, (26, N'alabama_intrastate_storage', 'hourly', 'multi-file', 'natgas.usp_upsert_proprietary_alabama_intrastate_storage', N'https://apps.genscape.com/gasproprietary/alabama_intrastate_storage/daily/')
, (27, N'michigan_intrastate_storage', 'hourly', 'multi-file', 'natgas.usp_upsert_proprietary_michigan_intrastate_storage', N'https://apps.genscape.com/gasproprietary/michigan_intrastate_storage/daily/')
, (28, N'illinois_intrastate_storage', 'hourly', 'multi-file', 'natgas.usp_upsert_proprietary_illinois_intrastate_storage', N'https://apps.genscape.com/gasproprietary/illinois_intrastate_storage/daily/')
, (29, N'ngpl_storage_breakout', 'hourly', 'multi-file', 'natgas.usp_upsert_proprietary_ngpl_storage_breakout', N'https://apps.genscape.com/gasproprietary/ngpl_storage_breakout/daily/')
, (30, N'lng', 'hourly', 'multi-file', 'natgas.usp_upsert_proprietary_lng', N'https://apps.genscape.com/gasproprietary/lng/hourly/')

, (31, N'lng_shipping', 'hourly', 'multi-file', 'natgas.usp_upsert_proprietary_lng_shipping', N'https://apps.genscape.com/gasproprietary/lng_shipping/hourly/')

, (32, N'index_of_customers', 'hourly', 'single', 'natgas.usp_upsert_index_of_customers', N'https://apps.genscape.com/gasdatafeed/v3/csv/index_of_customers/')
, (33, N'gas_production_forecast', 'hourly', 'multi-file', 'natgas.usp_upsert_springrock_datafeed', N'https://apps.genscape.com/springrockdatafeed/gas_production_forecast/')
) AS source_rows (source_id, source_name, source_type, load_type, load_proc, source_path)
WHERE NOT EXISTS (
    SELECT 1
    FROM [natgas].[source] AS existing
    WHERE existing.source_id = source_rows.source_id
       OR (
            existing.source_name = source_rows.source_name
        AND existing.source_type = source_rows.source_type
       )
)
GO
SET IDENTITY_INSERT [natgas].[source] OFF
GO

SET IDENTITY_INSERT [natgas].[quoted_file] ON
GO
INSERT [natgas].[quoted_file] ([quoted_file_id], [file_name], [quoted_columns])
SELECT quoted_file_id, file_name, quoted_columns
FROM (VALUES
-- Gasdatafeed
  (1, 'index_of_customers.csv', '(ferc_pipeline_id, original_revised_indicator, contact_person, header_footnote_code, shipper_name, reported_shipper_id, shipper_affiliation_indicator, rate_schedule, rate_description, contract_number, negotiated_rates_indicator, detail_footnote_code, agent_names, agent_affiliation_identifiers, agent_footnote_codes, point_identification_code_qualifier, point_identification_code, zone_name, point_footnote_code)')
, (2, 'location_extended.csv', '(loc_name, industry_title, facility, county, state, country, interconnecting_entity, tariff_zone)')
, (3, 'location_role.csv', '(role, role_code, meter, drn, flow_direction_compass_point)')
, (4, 'nomination_cycles.csv', '(cycle_code, name, type, created_timestamp)')
, (5, 'pipelines.csv', '(name, short_name, created_timestamp)')
, (6, 'plants.csv', '(plant_name, eia_code, state, county, created_timestamp)')

-- Proprietary Metadata
, (7, 'complex.csv', '(complex_name, facility_name, operator_name, county_name, state_name, country_name)')
, (8, 'complex_member_element.csv', '(element_name, element_type_name)')

-- Proprietary LNG
, (9, 'lng_berth_observations.csv', '(berth_name, vessel_name, start_time, end_time)')
, (10, 'lng_complex_detail.csv', '(complex_name, facility_type, operator_name, county_name, state_name, country_name)')
, (11, 'lng_regulatory_import_export_reports.csv', '(transaction_type, transaction_date, ix_company_name, supplier_seller_name, purchaser, docket_license, docket_contract_type, origin_country, destination_country, transportation_type, vessel, transaction_terminal, measurement_basis, notes)')
, (12, 'lng_ship_attribute.csv', '(ship_name, imo)')
, (13, 'lng_derived_storage.csv', '(gas_day)')

-- Proprietary LNG Shipping
, (14, 'lng_shipping_history.csv', '(origin_departure_time, destination_arrival_time, destination_departure_time, contract_type, notes)')
, (15, 'lng_facility_attribute.csv', '(facility_name, port_name, category, subcategory, status, territory_name, country_name, region_name, ocean_name, sea_name)')
, (16, 'lng_live_voyages.csv', '(last_updated, vessel_name, origin_facility, ais_destination, facility_destination_1, facility_destination_2, facility_destination_3, eta_to_facility_destination, origin_entry_time, origin_exit_time)')

-- Proprietary Intrastate Storage
, (17, 'illinois_raw_observations.csv', '(reported_units)')
, (18, 'michigan_raw_observations.csv', '(reported_units)')
, (19, 'raw_observations.csv', '(reported_units)')
, (20, 'ngpl_raw_observations.csv', '(reported_units)')

-- Proprietary Mexico Exports
, (21, 'by_point_daily.csv', '(point_name, source_name)')
, (22, 'by_point_monthly.csv', '(point_name, source_name)')

-- Proprietary SpringRock
, (23, 'daily_pipe_production.csv', '(report_date, gas_day, region, mmcf)')
, (24, 'gas_production_forecast.csv', '(report_date, month, dry_gas_actual, dry_gas_forecast, dry_gas_percent, dry_gas_yoy, wet_gas_forecast, wet_gas_actual, marketed_gas_percent, gas_rigs, oil_rigs, region, subregion)')
) AS quoted_file_rows (quoted_file_id, file_name, quoted_columns)
WHERE NOT EXISTS (
    SELECT 1
    FROM [natgas].[quoted_file] AS existing
    WHERE existing.quoted_file_id = quoted_file_rows.quoted_file_id
       OR existing.file_name = quoted_file_rows.file_name
)

GO
SET IDENTITY_INSERT [natgas].[quoted_file] OFF
GO
