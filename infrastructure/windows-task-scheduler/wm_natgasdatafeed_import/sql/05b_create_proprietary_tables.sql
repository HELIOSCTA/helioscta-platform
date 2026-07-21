/************************************************************************
Gas Proprietary Tables
************************************************************************/
IF OBJECT_ID('natgas.complex', 'U') IS NOT NULL
    PRINT 'natgas.complex Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[complex](
        [complex_id] [integer] NOT NULL,
        [complex_name] [varchar](255) NOT NULL,
        [facility_id] [integer] NOT NULL,
        [facility_name] [varchar](50),
        [operator_id] [integer] NOT NULL,
        [operator_name] [varchar](255) NOT NULL,
        [county_id] [integer] NOT NULL,
        [county_name] [varchar](100) NOT NULL,
        [state_id] [integer] NOT NULL,
        [state_name] [varchar](50) NOT NULL,
        [country_id] [integer] NOT NULL,
        [country_name] [varchar](50) NOT NULL,
        CONSTRAINT [PK_complex] PRIMARY KEY CLUSTERED 
        (
            [complex_id] ASC
        )
    )
    PRINT 'Table natgas.complex Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.complex_member_element', 'U') IS NOT NULL
    PRINT 'natgas.complex_member_element Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[complex_member_element](
        [complex_id] [integer] NOT NULL,
        [element_id] [integer] NOT NULL,
        [element_name] [varchar](255) NOT NULL,
        [element_type_id] [integer] NOT NULL,
        [element_type_name] [varchar](255) NOT NULL,
        CONSTRAINT [PK_complex_member_element] PRIMARY KEY CLUSTERED 
        (
            [complex_id] ASC,
            [element_id] ASC,
            [element_type_id] ASC
        )
    )
    PRINT 'Table natgas.complex_member_element Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.intrastate_storage_flow_estimates', 'U') IS NOT NULL
    PRINT 'natgas.intrastate_storage_flow_estimates Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[intrastate_storage_flow_estimates](
        [est_date] [date] NOT NULL,
        [complex_id] [integer] NOT NULL,
        [net_estimated_flow_mmcf] [numeric] NOT NULL,
        CONSTRAINT [PK_intrastate_storage_flow_estimates] PRIMARY KEY CLUSTERED 
        (
            [est_date] ASC,
            [complex_id] ASC
        )
    )
    PRINT 'Table natgas.intrastate_storage_flow_estimates Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.intrastate_storage_flow_indicators', 'U') IS NOT NULL
    PRINT 'natgas.intrastate_storage_flow_indicators Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[intrastate_storage_flow_indicators](
        [gas_day] [date] NOT NULL,
        [complex_id] [integer] NOT NULL,
        [injection_percent] [numeric] NULL,
        [withdrawal_percent] [numeric] NULL,
        [withdrawal_modifier_percent] [numeric] NULL,
        CONSTRAINT [PK_intrastate_storage_flow_indicators] PRIMARY KEY CLUSTERED 
        (
            [gas_day] ASC,
            [complex_id] ASC
        )
    )
    PRINT 'Table natgas.intrastate_storage_flow_indicators Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.intrastate_storage_raw_observations', 'U') IS NOT NULL
    PRINT 'natgas.intrastate_storage_raw_observations Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[intrastate_storage_raw_observations](
        [gas_day] [date] NOT NULL,
        [element_id] [integer] NOT NULL,
        [activity_value] [numeric] NOT NULL,
        [reported_units] [varchar](255) NOT NULL,
        CONSTRAINT [PK_intrastate_storage_raw_observations] PRIMARY KEY CLUSTERED 
        (
            [gas_day] ASC,
            [element_id] ASC
        )
    )
    PRINT 'Table natgas.intrastate_storage_raw_observations Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.mexico_exports_by_point_daily', 'U') IS NOT NULL
    PRINT 'natgas.mexico_exports_by_point_daily Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[mexico_exports_by_point_daily](
        [cal_day] [date] NOT NULL,
        [complex_id] [integer] NOT NULL,
        [point_name] [varchar](255) NOT NULL,
        [source_name] [varchar](255) NOT NULL,
        [daily_eia_estimate_shaped_mmcf] [numeric] NULL,
        [sample_mmcf] [numeric] NULL,
        CONSTRAINT [PK_mexico_exports_by_point_daily] PRIMARY KEY CLUSTERED 
        (
            [cal_day] ASC,
            [complex_id] ASC,
            [point_name] ASC
        )
    )
    PRINT 'Table natgas.mexico_exports_by_point_daily Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.mexico_exports_by_point_monthly', 'U') IS NOT NULL
    PRINT 'natgas.mexico_exports_by_point_monthly Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[mexico_exports_by_point_monthly](
        [year_month] [date] NOT NULL,
        [complex_id] [integer] NOT NULL,
        [point_name] [varchar](255) NOT NULL,
        [source_name] [varchar](255) NOT NULL,
        [export_mmcf] [numeric] NOT NULL,
        CONSTRAINT [PK_mexico_exports_by_point_monthly] PRIMARY KEY CLUSTERED 
        (
            [year_month] ASC,
            [complex_id] ASC,
            [point_name] ASC
        )
    )
    PRINT 'Table natgas.mexico_exports_by_point_monthly Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.mexico_exports_total_estimate_daily', 'U') IS NOT NULL
    PRINT 'natgas.mexico_exports_total_estimate_daily Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[mexico_exports_total_estimate_daily](
        [gas_day] [date] NOT NULL,
        [complex_id] [integer] NOT NULL,
        [genscape_sample] [numeric] NOT NULL,
        [genscape_best_estimate] [varchar](255) NOT NULL,
        CONSTRAINT [PK_mexico_exports_total_estimate_daily] PRIMARY KEY CLUSTERED 
        (
            [gas_day] ASC,
            [complex_id] ASC
        )
    )
    PRINT 'Table natgas.mexico_exports_total_estimate_daily Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.mexico_exports_monitored_pipeline_daily', 'U') IS NOT NULL
    PRINT 'natgas.mexico_exports_monitored_pipeline_daily Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[mexico_exports_monitored_pipeline_daily](
        [gas_day] [date] NOT NULL,
        [complex_id] [integer] NOT NULL,
        [genscape_sample] [numeric] NOT NULL,
        [genscape_best_estimate] [varchar](255) NOT NULL,
        CONSTRAINT [PK_mexico_exports_monitored_pipeline_daily] PRIMARY KEY CLUSTERED 
        (
            [gas_day] ASC,
            [complex_id] ASC
        )
    )
    PRINT 'Table natgas.mexico_exports_monitored_pipeline_daily Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.lng_ship_attribute', 'U') IS NOT NULL
    PRINT 'natgas.lng_ship_attribute Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[lng_ship_attribute](
        [ship_id] [integer] NOT NULL,
        [ship_name] [varchar](100) NOT NULL,
        [imo] [varchar](10) NOT NULL,
        [minimum_draft] [numeric],
        [maximum_draft] [numeric],
        [maximum_speed] [numeric],
        [capacity] [numeric]
    )
    PRINT 'Table natgas.lng_ship_attribute Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.lng_facility_attribute', 'U') IS NOT NULL
    PRINT 'natgas.lng_facility_attribute Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[lng_facility_attribute](
        [facility_id] [integer] NOT NULL,
        [facility_name] [varchar](100) NOT NULL,
        [port_name] [varchar](100) NOT NULL,
        [category] [varchar](100),
        [subcategory] [varchar](100),
        [status] [varchar](100),
        [berths] [varchar](100),
        [territory_name] [varchar](100),
        [country_name] [varchar](100),
        [region_name] [varchar](100),
        [ocean_name] [varchar](100),
        [sea_name] [varchar](100),
        [marine] [varchar](100)
    )
    PRINT 'Table natgas.lng_facility_attribute Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.lng_complex_detail', 'U') IS NOT NULL
    PRINT 'natgas.lng_complex_detail Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[lng_complex_detail](
        [complex_id] [integer],
        [complex_name] [varchar](100),
        [facility_type] [varchar](100),
        [operator_name] [varchar](100),
        [county_name] [varchar](100),
        [state_name] [varchar](100),
        [country_name] [varchar](100)
    )
    PRINT 'Table natgas.lng_complex_detail Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.lng_shipping_history', 'U') IS NOT NULL
    PRINT 'natgas.lng_shipping_history Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[lng_shipping_history](
        [origin_departure_time] [datetime],
        [destination_arrival_time] [datetime],
        [destination_departure_time] [datetime],
        [origin_id] [integer],
        [destination_id] [integer],
        [ship_id] [integer],
        [contract_type_id] [integer],
        [contract_type] [varchar](100),
        [spot] [bit],
        [fsru] [bit],
        [notes] [varchar](500)
    )
    PRINT 'Table natgas.lng_shipping_history Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.lng_berth_observations', 'U') IS NOT NULL
    PRINT 'natgas.lng_berth_observations Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[lng_berth_observations](
        [complex_id] [integer],
        [berth_name] [varchar](100),
        [berth_id] [integer],
        [vessel_name] [varchar](100),
        [vessel_id] [integer],
        [start_time] [datetime],
        [end_time] [datetime],
        [total_load_minutes] [integer]
    )
    PRINT 'Table natgas.lng_berth_observations Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.lng_derived_storage', 'U') IS NOT NULL
    PRINT 'natgas.lng_derived_storage Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[lng_derived_storage](
        [gas_day] [date],
        [complex_id] [integer],
        [inventory_change] [numeric],
        [inventory] [numeric]
    )
    PRINT 'Table natgas.lng_derived_storage Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.lng_live_voyages', 'U') IS NOT NULL
    PRINT 'natgas.lng_live_voyages Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[lng_live_voyages](
        [last_updated] [datetime],
        [vessel_name] [varchar](100),
        [loaded] [bit],
        [origin_facility] [varchar](100),
        [ais_destination] [varchar](100),
        [facility_destination_1] [varchar](100),
        [facility_destination_2] [varchar](100),
        [facility_destination_3] [varchar](100),
        [eta_to_facility_destination] [datetime],
        [distance_out] [integer],
        [speed] [numeric],
        [vessel_volume_bcf] [numeric](18,2),
        [origin_entry_time] [datetime],
        [origin_exit_time] [datetime],
        [time_at_origin_port] [numeric]
    )
    PRINT 'Table natgas.lng_live_voyages Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.lng_regulatory_import_export_reports', 'U') IS NOT NULL
    PRINT 'natgas.lng_regulatory_import_export_reports Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[lng_regulatory_import_export_reports](
        [transaction_type] [varchar](100),
        [transaction_date] [date],
        [ix_company_name] [varchar](100),
        [supplier_seller_name] [varchar](100),
        [purchaser] [varchar](100),
        [docket_license] [varchar](100),
        [docket_contract_type] [varchar](100),
        [origin_country] [varchar](100),
        [destination_country] [varchar](100),
        [transportation_type] [varchar](100),
        [vessel] [varchar](100),
        [transaction_terminal] [varchar](100),
        [volume] [numeric](18,8),
        [measurement_basis] [varchar](100),
        [price] [numeric],
        [notes] [varchar](300),
        [spot] [bit],
        [commissioning] [bit]
    )
    PRINT 'Table natgas.lng_regulatory_import_export_reports Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.lng_power_mag_field', 'U') IS NOT NULL
    PRINT 'natgas.lng_power_mag_field Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[lng_power_mag_field](
        [date_hour] [datetime],
        [complex_id] [integer],
        [mag_field] [numeric](8,4)
    )
    PRINT 'Table natgas.lng_power_mag_field Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.springrock_daily_pipe_production', 'U') IS NOT NULL
    PRINT 'natgas.springrock_daily_pipe_production Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[springrock_daily_pipe_production](
        [report_date] [date],
        [gas_day] [date],
        [region] [varchar](255),
        [mmcf] [numeric](18,2)
    )
    PRINT 'Table natgas.springrock_daily_pipe_production Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.springrock_gas_production_forecast', 'U') IS NOT NULL
    PRINT 'natgas.springrock_gas_production_forecast Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[springrock_gas_production_forecast](
        [report_date] [date],
        [month] [date],
        [dry_gas_actual] [numeric](18,2),
        [dry_gas_forecast] [numeric](18,2),
        [dry_gas_percent] [numeric](18,2),
        [dry_gas_yoy] [numeric](18,2),
        [wet_gas_forecast] [numeric](18,2),
        [wet_gas_actual] [numeric](18,2),
        [marketed_gas_percent] [numeric](18,2),
        [gas_rigs] [numeric](18,2),
        [oil_rigs] [numeric](18,2),
        [region] [varchar](255),
        [subregion] [varchar](255)
    )
    PRINT 'Table natgas.springrock_gas_production_forecast Created'
END
GO
