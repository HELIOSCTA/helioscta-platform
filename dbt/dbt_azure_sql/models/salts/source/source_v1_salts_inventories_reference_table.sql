{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- SALTS INVENTORY FACILITY LOOKUP
---------------------------

SELECT
    storage_facility_name,
    pipeline_name,
    location_role_id,
    facility,
    role,
    storage_sign
FROM (
    VALUES
        -- Eminence
        ('eminence', 'Transcontinental Gas Pipe Line Corporation', 97892, 'STORAGE', 'INVENTORY', 1)
        ,('eminence', 'Transcontinental Gas Pipe Line Corporation', 428372, 'STORAGE', 'CHANGE_INVENTORY', -1)
        ,('eminence', 'Transcontinental Gas Pipe Line Corporation', 97355, 'STORAGE', 'INJECTION', 1)
        ,('eminence', 'Transcontinental Gas Pipe Line Corporation', 97354, 'STORAGE', 'WITHDRAWAL', -1)

        -- Golden Triangle
        ,('golden_triangle', 'Golden Triangle Storage', 413635, 'STORAGE', 'INVENTORY', 1)
        ,('golden_triangle', 'Golden Triangle Storage', 428415, 'STORAGE', 'CHANGE_INVENTORY', -1)
        ,('golden_triangle', 'Golden Triangle Storage', 413637, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Perryville
        ,('perryville', 'Perryville Gas Storage', 457823, 'STORAGE', 'INVENTORY', 1)
        ,('perryville', 'Perryville Gas Storage', 435745, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Pine Prairie
        ,('pine_prarie', 'Pine Prairie Energy Center LLC', 106681, 'STORAGE', 'INVENTORY', 1)
        ,('pine_prarie', 'Pine Prairie Energy Center LLC', 428406, 'STORAGE', 'CHANGE_INVENTORY', -1)
        ,('pine_prarie', 'Pine Prairie Energy Center LLC', 147084, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Southern Pines
        ,('southern_pines', 'Southern Pines Energy Center', 428640, 'STORAGE', 'INVENTORY', 1)
        ,('southern_pines', 'Southern Pines Energy Center', 406799, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

) AS lookup_data(storage_facility_name, pipeline_name, location_role_id, facility, role, storage_sign)
