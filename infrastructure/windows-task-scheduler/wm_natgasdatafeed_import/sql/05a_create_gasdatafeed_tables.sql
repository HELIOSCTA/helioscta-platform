/************************************************************************
Gas DataFeed Tables
************************************************************************/
IF OBJECT_ID('natgas.gas_burn', 'U') IS NOT NULL
    PRINT 'natgas.gas_burn Exists'
ELSE
BEGIN
    CREATE TABLE natgas.gas_burn (
        [location_id] [int] NOT NULL,
        [flow_timestamp_central] [datetime] NOT NULL,
        [hourly_flow_mcf] [numeric](18, 0) NULL,
        [update_timestamp] [datetime] NULL,
        [created_timestamp] [datetime] NULL,
        [pipeline_id] [int] NOT NULL,
        CONSTRAINT [PK_fact_gas_burn_pk] PRIMARY KEY CLUSTERED 
        (
            [location_id] ASC,
            [flow_timestamp_central] ASC,
            [pipeline_id] ASC
        )
    )
    PRINT 'Table natgas.gas_burn Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.gas_quality', 'U') IS NOT NULL
    PRINT 'natgas.gas_quality Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[gas_quality](
        [location_id] [int] NOT NULL,
        [gas_day] [date] NOT NULL,
        [name] [varchar](200) NOT NULL,
        [value] [numeric](16, 6) NULL,
        [update_timestamp] [datetime] NULL,
        [created_timestamp] [datetime] NULL,
        CONSTRAINT [PK_gas_quality_pk] PRIMARY KEY CLUSTERED 
        (
            [location_id] ASC,
            [gas_day] ASC,
            [name] ASC
        )
    )
    PRINT 'Table natgas.gas_quality Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.location_extended', 'U') IS NOT NULL
    PRINT 'natgas.location_extended Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[location_extended](
        [location_id] [int] NOT NULL,
        [loc_name] [varchar](100) NULL,
        [geo_conf] [int] NULL,
        [naics_industry_id] [int] NULL,
        [industry_title] [varchar](200) NULL,
        [pipeline_id] [int] NULL,
        [facility] [varchar](50) NULL,
        [county] [varchar](100) NULL,
        [state] [varchar](50) NULL,
        [country] [varchar](50) NULL,
        [latitude] [float] NULL,
        [longitude] [float] NULL,
        [ie_id] [int] NULL,
        [interconnecting_entity] [varchar](100) NULL,
        [tz_id] [int] NULL,
        [tariff_zone] [varchar](100) NULL,
        [location_best_flow] [bit] NULL,
        CONSTRAINT [PK_location_extended] PRIMARY KEY CLUSTERED 
        (
            [location_id] ASC
        )
    )
    PRINT 'Table natgas.location_extended Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.location_role', 'U') IS NOT NULL
    PRINT 'natgas.location_role Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[location_role](
        [location_role_id] [int] NOT NULL,
        [location_id] [int] NOT NULL,
        [role] [varchar](20) NULL,
        [role_code] [varchar](10) NULL,
        [meter] [varchar](30) NULL,
        [drn] [varchar](30) NULL,
        [flow_direction_compass_point] [varchar](3) NULL,
        [best_storage] [bit] NULL,
        [sign] [int] NULL,
        CONSTRAINT [PK_location_role] PRIMARY KEY CLUSTERED 
        (
            [location_role_id] ASC
        )
    )
    PRINT 'Table natgas.location_role Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.no_notice', 'U') IS NOT NULL
    PRINT 'natgas.no_notice Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[no_notice](
        [location_role_id] [int] NOT NULL,
        [gas_day] [date] NOT NULL,
        [no_notice_capacity] [numeric](18, 0) NULL,
        [units] [varchar](10) NULL,
        [update_timestamp] [datetime] NULL,
        [created_timestamp] [datetime] NULL,
        CONSTRAINT [PK_fact_no_notice_pk] PRIMARY KEY CLUSTERED 
        (
            [location_role_id] ASC,
            [gas_day] ASC
        )
    )
    PRINT 'Table natgas.no_notice Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.nomination_cycles', 'U') IS NOT NULL
    PRINT 'natgas.nomination_cycles Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[nomination_cycles](
        [cycle_code] [varchar](10) NOT NULL,
        [name] [varchar](20) NULL,
        [type] [char](1) NULL,
        [created_timestamp] [datetime] NULL,
        CONSTRAINT [PK_datafeedload_v2_nomination_cycles] PRIMARY KEY CLUSTERED 
        (
            [cycle_code] ASC
        )
    )
    PRINT 'Table natgas.nomination_cycles Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.nominations', 'U') IS NOT NULL
    PRINT 'natgas.nominations Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[nominations](
        [location_role_id] [int] NOT NULL,
        [gas_day] [date] NOT NULL,
        [cycle_code] [varchar](10) NOT NULL,
        [role_code] [varchar](10) NULL,
        [operational_cap] [numeric](18, 0) NULL,
        [available_cap] [numeric](18, 0) NULL,
        [scheduled_cap] [numeric](18, 0) NULL,
        [design_cap] [numeric](18, 0) NULL,
        [units] [varchar](10) NULL,
        [update_timestamp] [datetime] NULL,
        CONSTRAINT [PK_nominations_1] PRIMARY KEY CLUSTERED 
        (
            [location_role_id] ASC,
            [gas_day] ASC
        )
    )
    PRINT 'Table natgas.nominations Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.pipeline_inventory', 'U') IS NOT NULL
    PRINT 'natgas.pipeline_inventory Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[pipeline_inventory](
        [location_role_id] [int] NOT NULL,
        [week_ending_date] [date] NOT NULL,
        [inventory] [numeric](18, 0) NULL,
        [inventory_change] [numeric](18, 0) NULL,
        [created_timestamp] [datetime] NULL,
    CONSTRAINT [PK_pipeline_inventory] PRIMARY KEY CLUSTERED 
        (
            [location_role_id] ASC,
            [week_ending_date] ASC
        )
    )
    PRINT 'Table natgas.pipeline_inventory Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.pipelines', 'U') IS NOT NULL
    PRINT 'natgas.pipelines Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[pipelines](
        [pipeline_id] [int] NOT NULL,
        [name] [varchar](100) NULL,
        [short_name] [varchar](50) NULL,
        [min_gas_day] [date] NULL,
        [ferc_720] [bit] NULL,
        [created_timestamp] [datetime] NULL,
        CONSTRAINT [PK_pipelines] PRIMARY KEY CLUSTERED 
        (
            [pipeline_id] ASC
        )
    )
    PRINT 'Table natgas.pipelines Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.plants', 'U') IS NOT NULL
    PRINT 'natgas.plants Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[plants](
        [natgas_plant_id] [int] NOT NULL,
        [plant_name] [varchar](100) NULL,
        [eia_code] [varchar](5) NULL,
        [state] [varchar](50) NULL,
        [county] [varchar](100) NULL,
        [power_plant_id] [int] NULL,
        [created_timestamp] [datetime] NULL,
        [location_id] [int] NOT NULL,
        CONSTRAINT [PK_plants] PRIMARY KEY CLUSTERED 
        (
            [natgas_plant_id] ASC,
            [location_id] ASC
        )
    )
    PRINT 'Table natgas.plants Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.pipeline_scheduling', 'U') IS NOT NULL
    PRINT 'natgas.pipeline_scheduling Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[pipeline_scheduling](
        [id] [integer] NOT NULL,
        [pipeline_id] [integer] NOT NULL,
        [scheduling_cycle_id] [integer] NOT NULL,
        [chron_order] [integer] NULL,
        [std_scheduling_cycle_id] [integer] NULL,
        [hourly_nom_plan] [bit] NULL,
        [hourly_nom_flow] [bit] NULL,
        [hourly_nom_post] [bit] NULL,
        CONSTRAINT [PK_pipeline_scheduling] PRIMARY KEY CLUSTERED ([id] ASC)
    )
    PRINT 'Table natgas.pipeline_scheduling Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.scheduling_cycles', 'U') IS NOT NULL
    PRINT 'natgas.scheduling_cycles Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[scheduling_cycles](
        [id] [integer] NOT NULL,
        [cycle_code] [varchar](10) NOT NULL,
        [name] [varchar](20) NOT NULL,
        [type] [char](1) NOT NULL,
        [created_timestamp] [datetime] NULL,
        CONSTRAINT [PK_scheduling_cycles] PRIMARY KEY CLUSTERED ([id] ASC)
    )
    PRINT 'Table natgas.scheduling_cycles Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.all_cycles', 'U') IS NOT NULL
    PRINT 'natgas.all_cycles Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[all_cycles](
        [location_role_id] [int] NOT NULL,
        [gas_day] [date] NOT NULL,
        [cycle_id] [int] NOT NULL,
        [operational_cap] [bigint] NULL,
        [available_cap] [bigint] NULL,
        [scheduled_cap] [bigint] NULL,
        [design_cap] [bigint] NULL
        CONSTRAINT [PK_all_cycles] PRIMARY KEY CLUSTERED 
        (
            [location_role_id] ASC,
            [gas_day] ASC,
            [cycle_id] ASC
        )
    )
    PRINT 'Table natgas.all_cycles Created'
END
GO

--------------------------------------------------------------------------------
IF OBJECT_ID('natgas.index_of_customers', 'U') IS NOT NULL
    PRINT 'natgas.index_of_customers Exists'
ELSE
BEGIN
    CREATE TABLE [natgas].[index_of_customers](
        [genscape_header_id] [integer],
        [genscape_detail_id] [integer],
        [genscape_point_id] [integer],
        [pipeline_id] [integer],
        [ferc_pipeline_id] [varchar](100),
        [report_date] [date],
        [original_revised_indicator] [varchar](100),
        [quarter_calendar_start] [date],
        [contact_person] [varchar](100),
        [header_footnote_code] [varchar](100),
        [shipper_name] [varchar](200),
        [reported_shipper_id] [varchar](30),
        [shipper_affiliation_indicator] [varchar](1),
        [rate_schedule_id] [integer],
        [rate_schedule] [varchar](10),
        [rate_description] [varchar](100),
        [contract_number] [varchar](100),
        [contract_eff_date] [date],
        [contract_primary_expiration] [date],
        [days_until_next_poss_expiration] [integer],
        [negotiated_rates_indicator] [varchar](100),
        [contract_max_daily_transport_mmbtu] [numeric],
        [contract_max_storage_daily_mmbtu] [numeric],
        [detail_footnote_code] [varchar](100),
        [agent_names] [varchar](5000),
        [agent_affiliation_identifiers] [varchar](100),
        [agent_footnote_codes] [varchar](100),
        [location_role_id] [integer],
        [point_identification_code_qualifier] [varchar](100),
        [point_identification_code] [varchar](100),
        [zone_name] [varchar](100),
        [location_max_daily_transport_mmbtu] [numeric],
        [location_max_storage_daily_mmbtu] [numeric],
        [point_footnote_code] [varchar](100)
    )
    PRINT 'Table natgas.index_of_customers Created'
END
GO
