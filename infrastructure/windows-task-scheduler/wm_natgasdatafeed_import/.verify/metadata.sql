-- DATASETS
select * from [natgas].[source] where source_type='metadata'

-- DELETE
DELETE FROM natgas.source
WHERE source_id IN (
    23  -- proprietary_metadata
)

-- CHECKS
-- -----------------------------------
-- TODO:
-- -----------------------------------
select count(*) as location_extended from [natgas].[location_extended]
select count(*) as location_role from [natgas].[location_role]

-- -----------------------------------
-- PIPELINES / PLANTS
-- -----------------------------------
-- select count(*) from [natgas].[pipelines] 
-- select count(*) from [natgas].[plants]

-- -----------------------------------
-- CYCLES
-- -----------------------------------
-- select count(*) from [natgas].[nomination_cycles] 
-- select count(*) from [natgas].[scheduling_cycles] 
-- select count(*) from [natgas].[pipeline_scheduling] 

-- -----------------------------------
-- NOTE: ....
-- -----------------------------------
-- select count(*) from [natgas].[complex] 
-- select count(*) from [natgas].[complex_member_element]