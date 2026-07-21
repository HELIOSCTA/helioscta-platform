IF OBJECT_ID('natgas.usp_upsert_gasdatafeed_pipelines') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_gasdatafeed_pipelines AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_gasdatafeed_pipelines
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new metadata pipelines records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON

    /* Update Insert Pipelines */
    MERGE natgas.pipelines AS target
        USING (
            SELECT pipeline_id
                , name
                , short_name
                , min_gas_day
                , ferc_720
                , created_timestamp
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (pipeline_id, name, short_name, min_gas_day, ferc_720, created_timestamp)
        ON (target.pipeline_id = source.pipeline_id)
        WHEN MATCHED THEN
            UPDATE
                SET name = source.name,
                short_name = source.short_name,
                min_gas_day = source.min_gas_day,
                ferc_720 = source.ferc_720,
                created_timestamp = source.created_timestamp
    WHEN NOT MATCHED THEN
        INSERT (
              pipeline_id
            , name
            , short_name
            , min_gas_day
            , ferc_720
            , created_timestamp
        )
        VALUES (
              source.pipeline_id
            , source.name
            , source.short_name
            , source.min_gas_day
            , source.ferc_720
            , source.created_timestamp
        );

    SET @rowcount = @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_gasdatafeed_location_extended') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_gasdatafeed_location_extended AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_gasdatafeed_location_extended
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new metadata location_extended records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    /* Update Insert location_extended */
    WITH duplicate_cte (
          id
        , location_id
        , loc_name
        , geo_conf
        , naics_industry_id
        , industry_title
        , pipeline_id
        , facility
        , county
        , state
        , country
        , latitude
        , longitude
        , ie_id
        , interconnecting_entity
        , tz_id
        , tariff_zone
        , location_best_flow
    )
    AS (
        SELECT ROW_NUMBER() OVER(ORDER BY location_id) AS id
            , location_id
            , loc_name
            , geo_conf
            , naics_industry_id
            , industry_title
            , pipeline_id
            , facility
            , county
            , state
            , country
            , latitude
            , longitude
            , ie_id
            , interconnecting_entity
            , tz_id
            , tariff_zone
            , location_best_flow
        FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
    )
    MERGE natgas.location_extended AS target
    USING (
        SELECT m.location_id
            , m.loc_name
            , m.geo_conf
            , m.naics_industry_id
            , m.industry_title
            , m.pipeline_id
            , m.facility
            , m.county
            , m.state
            , m.country
            , m.latitude
            , m.longitude
            , m.ie_id
            , m.interconnecting_entity
            , m.tz_id
            , m.tariff_zone
            , m.location_best_flow
        FROM (
            SELECT *
            FROM duplicate_cte AS d
            INNER JOIN (
                SELECT MAX(id) AS id1
                , d1.location_id AS location_id1 
                FROM duplicate_cte d1 GROUP BY d1.location_id
            ) AS d2 ON d.id = d2.id1
                AND d.location_id = d2.location_id1) AS m
    ) AS SOURCE (
          location_id
        , loc_name
        , geo_conf
        , naics_industry_id
        , industry_title
        , pipeline_id
        , facility
        , county
        , state
        , country
        , latitude
        , longitude
        , ie_id
        , interconnecting_entity
        , tz_id
        , tariff_zone
        , location_best_flow
    ) ON (TARGET.location_id = SOURCE.location_id)
    WHEN MATCHED THEN
        UPDATE
            SET loc_name = SOURCE.loc_name,
            geo_conf = SOURCE.geo_conf,
            naics_industry_id = SOURCE.naics_industry_id,
            industry_title = SOURCE.industry_title,
            pipeline_id = SOURCE.pipeline_id,
            facility = SOURCE.facility,
            county = SOURCE.county,
            state = SOURCE.STATE,
            country = SOURCE.country,
            latitude = SOURCE.latitude,
            longitude = SOURCE.longitude,
            ie_id = SOURCE.ie_id,
            interconnecting_entity = SOURCE.interconnecting_entity,
            tz_id = SOURCE.tz_id,
            tariff_zone = SOURCE.tariff_zone,
            location_best_flow = SOURCE.location_best_flow
    WHEN NOT MATCHED THEN
        INSERT (
              location_id
            , loc_name
            , geo_conf
            , naics_industry_id
            , industry_title
            , pipeline_id
            , facility
            , county
            , state
            , country
            , latitude
            , longitude
            , ie_id
            , interconnecting_entity
            , tz_id
            , tariff_zone
            , location_best_flow
        )
        VALUES (
              source.location_id
            , source.loc_name
            , source.geo_conf
            , source.naics_industry_id
            , source.industry_title
            , source.pipeline_id
            , source.facility
            , source.county
            , source.state
            , source.country
            , source.latitude
            , source.longitude
            , source.ie_id
            , source.interconnecting_entity
            , source.tz_id
            , source.tariff_zone
            , source.location_best_flow
        );

    SET @rowcount = @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_gasdatafeed_location_role') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_gasdatafeed_location_role AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_gasdatafeed_location_role
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new metadata location_role records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON

    /* Update Insert location_role */
     MERGE natgas.location_role AS target
        USING (
            SELECT location_role_id
                , location_id
                , role
                , role_code
                , meter
                , drn
                , flow_direction_compass_point
                , best_storage
                , sign
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (location_role_id, location_id, role, role_code, meter, drn, flow_direction_compass_point, best_storage, sign)
        ON (target.location_role_id = source.location_role_id)
        WHEN MATCHED THEN
            UPDATE
                SET location_id = source.location_id,
                role = source.role,
                role_code = source.role_code,
                meter = source.meter,
                drn = source.drn,
                flow_direction_compass_point = source.flow_direction_compass_point,
                best_storage = source.best_storage,
                sign = source.sign
    WHEN NOT MATCHED THEN
        INSERT (
              location_role_id
            , location_id
            , role
            , role_code
            , meter
            , drn
            , flow_direction_compass_point
            , best_storage
            , sign
        )
        VALUES (
              source.location_role_id
            , source.location_id
            , source.role
            , source.role_code
            , source.meter
            , source.drn
            , source.flow_direction_compass_point
            , source.best_storage
            , source.sign
        );

    SET @rowcount = @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_gasdatafeed_plants') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_gasdatafeed_plants AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_gasdatafeed_plants
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new metadata plants records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON

    /* Update Insert plants */
     MERGE [natgas].[plants] AS target
        USING (
            SELECT natgas_plant_id
                , plant_name
                , eia_code
                , state
                , county
                , power_plant_id
                , created_timestamp
                , location_id
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (natgas_plant_id, plant_name, eia_code, state, county, power_plant_id, created_timestamp, location_id)
        ON (target.natgas_plant_id = source.natgas_plant_id
            AND target.location_id = source.location_id)
        WHEN MATCHED THEN
            UPDATE
                SET plant_name = source.plant_name,
                eia_code = source.eia_code,
                state = source.state,
                county = source.county,
                power_plant_id = source.power_plant_id,
                created_timestamp = source.created_timestamp
    WHEN NOT MATCHED THEN
        INSERT (
              natgas_plant_id
            , plant_name
            , eia_code
            , state
            , county
            , power_plant_id
            , created_timestamp
            , location_id
        )
        VALUES (
              source.natgas_plant_id
            , source.plant_name
            , source.eia_code
            , source.state
            , source.county
            , source.power_plant_id
            , source.created_timestamp
            , source.location_id
        );

    SET @rowcount = @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_gasdatafeed_nomination_cycles') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_gasdatafeed_nomination_cycles AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_gasdatafeed_nomination_cycles
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new metadata nomination_cycles records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON

    /* Update Insert nomination_cycles */
     MERGE natgas.nomination_cycles AS target
        USING (
            SELECT cycle_code
                , name
                , type
                , created_timestamp
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (cycle_code, name, type, created_timestamp)
        ON (target.cycle_code = source.cycle_code)
        WHEN MATCHED THEN
            UPDATE
                SET name = source.name,
                type = source.type,
                created_timestamp = source.created_timestamp
    WHEN NOT MATCHED THEN
        INSERT (
            cycle_code
            , name
            , type
            , created_timestamp
        )
        VALUES (
              source.cycle_code
            , source.name
            , source.type
            , source.created_timestamp
        );

    SET @rowcount = @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_gasdatafeed_pipeline_scheduling') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_gasdatafeed_pipeline_scheduling AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_gasdatafeed_pipeline_scheduling
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new metadata pipeline_scheduling records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON

    /* Update Insert pipeline_scheduling */
     MERGE natgas.pipeline_scheduling AS target
        USING (
            SELECT id
                , pipeline_id
                , scheduling_cycle_id
                , chron_order
                , std_scheduling_cycle_id
                , CASE hourly_nom_plan WHEN 't' THEN 1 ELSE 0 END AS hourly_nom_plan
                , CASE hourly_nom_flow WHEN 't' THEN 1 ELSE 0 END AS hourly_nom_flow
                , CASE hourly_nom_post WHEN 't' THEN 1 ELSE 0 END AS hourly_nom_post
            FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
        ) AS source (id
            , pipeline_id
            , scheduling_cycle_id
            , chron_order
            , std_scheduling_cycle_id
            , hourly_nom_plan
            , hourly_nom_flow
            , hourly_nom_post
            )
        ON (target.id = source.id)
        WHEN MATCHED THEN
            UPDATE
                SET pipeline_id = source.pipeline_id,
                scheduling_cycle_id = source.scheduling_cycle_id,
                chron_order = source.chron_order,
                std_scheduling_cycle_id = source.std_scheduling_cycle_id,
                hourly_nom_plan = source.hourly_nom_plan,
                hourly_nom_flow = source.hourly_nom_flow,
                hourly_nom_post = source.hourly_nom_post
    WHEN NOT MATCHED THEN
        INSERT (
              id
            , pipeline_id
            , scheduling_cycle_id
            , chron_order
            , std_scheduling_cycle_id
            , hourly_nom_plan
            , hourly_nom_flow
            , hourly_nom_post
        )
        VALUES (
              source.id
            , source.pipeline_id
            , source.scheduling_cycle_id
            , source.chron_order
            , source.std_scheduling_cycle_id
            , source.hourly_nom_plan
            , source.hourly_nom_flow
            , source.hourly_nom_post
        );

    SET @rowcount = @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_gasdatafeed_pipeline_inventory') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_gasdatafeed_pipeline_inventory AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_gasdatafeed_pipeline_inventory
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new pipeline_inventory records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON

    MERGE natgas.pipeline_inventory AS target
    USING (
        SELECT location_role_id
            , week_ending_date
            , CASE WHEN (RTRIM(LTRIM(inventory)) = '') THEN NULL ELSE inventory END
            , CASE WHEN (RTRIM(LTRIM(inventory_change)) = '') THEN NULL ELSE inventory_change END
            , REPLACE(LEFT(created_timestamp, LEN(created_timestamp)-6), 'T', ' ') AS created_timestamp
        FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
    ) AS source (location_role_id, week_ending_date, inventory, inventory_change, created_timestamp)
    ON (target.location_role_id = source.location_role_id
    AND target.week_ending_date = source.week_ending_date)
    -- update existing records
    WHEN MATCHED THEN
        UPDATE
            SET inventory = source.inventory,
            inventory_change = source.inventory_change,
            created_timestamp = source.created_timestamp
    -- insert new records
    WHEN NOT MATCHED BY TARGET THEN
    INSERT (
          location_role_id
        , week_ending_date
        , inventory
        , inventory_change
        , created_timestamp
    )
    VALUES (
          source.location_role_id
        , source.week_ending_date
        , source.inventory
        , source.inventory_change
        , source.created_timestamp
    )
    -- remove records that should no longer be in the table
    WHEN NOT MATCHED BY SOURCE THEN
    DELETE;

    SET @rowcount = @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO


IF OBJECT_ID('natgas.usp_upsert_gasdatafeed_scheduling_cycles') IS NULL
    EXEC('CREATE PROCEDURE natgas.usp_upsert_gasdatafeed_scheduling_cycles AS SET NOCOUNT ON;')
GO
ALTER PROCEDURE natgas.usp_upsert_gasdatafeed_scheduling_cycles
@rowcount integer = NULL OUTPUT
AS
/* ----------------------------------------------------------------------
GIT URL:        https://github.com/Genscape/gasdatafeed_import
Purpose:        Deletes old and inserts new metadata scheduling_cycles records
Dependencies:   administration.usp_get_error_info
---------------------------------------------------------------------- */
BEGIN TRY
    SET NOCOUNT ON

    /* Update Insert scheduling_cycles */
    MERGE natgas.scheduling_cycles AS target
    USING (
        SELECT id
            , cycle_code
            , name
            , type
            , created_timestamp
        FROM CsvToSqlTemp t -- this is the temp table created during the gasdatafeed_import.ps1 process
    ) AS source (id, cycle_code, name, type, created_timestamp)
    ON (target.id = source.id)
    WHEN MATCHED THEN
        UPDATE
            SET cycle_code = source.cycle_code,
            name = source.name,
            type = source.type,
            created_timestamp = source.created_timestamp
    WHEN NOT MATCHED THEN
        INSERT (
            id
            , cycle_code
            , name
            , type
            , created_timestamp
        )
        VALUES (
            source.id
            , source.cycle_code
            , source.name
            , source.type
            , source.created_timestamp
        );

    SET @rowcount = @@ROWCOUNT;

END TRY
BEGIN CATCH
    DECLARE @database_name NVARCHAR(128), @stored_procedure NVARCHAR(255), @error NVARCHAR(4000);
    SELECT @database_name = DB_NAME(), @stored_procedure = ERROR_PROCEDURE() , @error = ERROR_MESSAGE();
    EXEC administration.usp_get_error_info @database_name, @stored_procedure, @error;
    THROW;
END CATCH;
GO
