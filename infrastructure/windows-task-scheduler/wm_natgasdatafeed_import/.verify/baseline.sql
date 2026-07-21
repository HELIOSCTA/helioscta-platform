-- DATASETS
select * from [natgas].[source] where source_type='baseline'


-- CHECKS
-- -----------------------------------
-- TODO:
-- -----------------------------------
-- select year(gas_day) as yr, count(*) from [natgas].[gas_quality] group by year(gas_day) order by yr
-- select year(gas_day) as yr, count(*) from [natgas].[no_notice] group by year(gas_day) order by yr 
-- select year(gas_day) as yr, count(*) from [natgas].[nominations] group by year(gas_day) order by yr 
-- select year([flow_timestamp_central]) as yr, count(*) from [natgas].[gas_burn] group by year([flow_timestamp_central]) order by yr 
-- select year(gas_day) as yr, count(*) from [natgas].[all_cycles] group by year(gas_day) order by yr 

-- year, month
select 
    year(gas_day) as year
    ,month(gas_day) as month
    ,count(*) 
from [natgas].[all_cycles] 
WHERE year(gas_day) = 2025 and month(gas_day) = 10
group by year(gas_day), month(gas_day) 
order by year, month

-- gas_day
select 
    gas_day
    ,count(*) 
from [natgas].[all_cycles] 
WHERE gas_day >= '2025-10-05'
group by gas_day
order by gas_day desc