-- DATASETS
select * from [natgas].[source] where source_type='hourly'

-- DELETE
DELETE FROM natgas.source
WHERE source_id IN (
    24,  -- intrastate_storage
    25,  -- mexico_exports
    26,  -- alabama_intrastate_storage
    27,  -- michigan_intrastate_storage
    28,  -- illinois_intrastate_storage
    29,  -- ngpl_storage_breakout
    30,  -- lng
    31   -- lng_shipping
)

-- intrastate_storage
-- mexico_exports
-- alabama_intrastate_storage
-- michigan_intrastate_storage
-- illinois_intrastate_storage
-- ngpl_storage_breakout
-- lng
-- lng_shipping