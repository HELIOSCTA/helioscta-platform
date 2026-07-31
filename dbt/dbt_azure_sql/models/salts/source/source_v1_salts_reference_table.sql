{{
  config(
    materialized='ephemeral'
  )
}}

---------------------------
-- SALTS STORAGE FACILITY LOOKUP
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
        -- Arcadia Gas Storage
        ('arcadia', 'Arcadia Gas Storage LLC', 406856, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Bay Gas Storage
        ,('bay_gas', 'Bay Gas Storage Company, LTD', 451209, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Boardwalk Storage Company, FKA Petrologistics
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434201, 'INTRASTATE INTERCONNECT', 'DELIVERY', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434202, 'INTRASTATE INTERCONNECT', 'RECEIPT', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434203, 'INTRASTATE INTERCONNECT', 'DELIVERY', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434204, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434205, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434206, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434207, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434208, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434209, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434210, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434211, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434212, 'GAS PROCESSING PLANT', 'DELIVERY', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434213, 'GAS PROCESSING PLANT', 'RECEIPT', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434218, 'INTRASTATE INTERCONNECT', 'RECEIPT', 1)
        -- NOTE: below are older locations pre-2023-09-30
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434215, 'STORAGE', 'INJECTION', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434223, 'STORAGE', 'WITHDRAWAL', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434216, 'GATHERING SYSTEM INTERCONNECT', 'DELIVERY', -1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 452155, 'POOL POINT', 'RECEIPT', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 455375, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('boardwalk', 'Boardwalk Storage Company, FKA Petrologistics', 434217, 'GATHERING SYSTEM INTERCONNECT', 'RECEIPT', 1)

        -- Bobcat Gas Storage
        ,('bobcat', 'Bobcat Gas Storage', 147334, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Egan
        ,('egan', 'Egan', 427681, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Eminence Storage
        ,('eminence', 'Transcontinental Gas Pipe Line Corporation', 97355, 'STORAGE', 'INJECTION', 1)
        ,('eminence', 'Transcontinental Gas Pipe Line Corporation', 97354, 'STORAGE', 'WITHDRAWAL', -1)

        -- Golden Triangle
        ,('golden_triangle', 'Golden Triangle Storage', 413637, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Jefferson Island Storage
        ,('jefferson_island', 'Columbia Gulf Transmission', 110858, 'INTERSTATE INTERCONNECT', 'RECEIPT', -1)
        ,('jefferson_island', 'Columbia Gulf Transmission', 126358, 'INTERSTATE INTERCONNECT', 'DELIVERY', 1)
        ,('jefferson_island', 'Gulf South Pipeline Company LP', 90704, 'INTERSTATE INTERCONNECT', 'RECEIPT', -1)
        ,('jefferson_island', 'Gulf South Pipeline Company LP', 91299, 'INTERSTATE INTERCONNECT', 'DELIVERY', 1)
        ,('jefferson_island', 'Natural Gas Pipeline Company of America, LLC', 120575, 'STORAGE', 'INJECTION', 1)
        ,('jefferson_island', 'Natural Gas Pipeline Company of America, LLC', 120140, 'STORAGE', 'WITHDRAWAL', -1)
        ,('jefferson_island', 'Sabine Pl', 109292, 'INTERSTATE INTERCONNECT', 'RECEIPT', -1)
        ,('jefferson_island', 'Sabine Pl', 146236, 'INTERSTATE INTERCONNECT', 'DELIVERY', 1)
        ,('jefferson_island', 'Sea Robin', 124974, 'INTERSTATE INTERCONNECT', 'DELIVERY', 1)
        ,('jefferson_island', 'Tennessee Gas Pipeline', 115353, 'INTERSTATE INTERCONNECT', 'RECEIPT', -1)
        ,('jefferson_island', 'Tennessee Gas Pipeline', 116572, 'INTERSTATE INTERCONNECT', 'DELIVERY', 1)
        ,('jefferson_island', 'Texas Gas Transmission Corp', 404305, 'INTERSTATE INTERCONNECT', 'RECEIPT', -1)
        ,('jefferson_island', 'Texas Gas Transmission Corp', 404306, 'INTERSTATE INTERCONNECT', 'DELIVERY', 1)
        ,('jefferson_island', 'Trunkline Gas Company', 87020, 'INTERSTATE INTERCONNECT', 'RECEIPT', -1)
        ,('jefferson_island', 'Trunkline Gas Company', 119451, 'INTERSTATE INTERCONNECT', 'DELIVERY', 1)

        -- Keystone Storage
        ,('keystone', 'El Paso Natural Gas', 89250, 'STORAGE', 'INJECTION', 1)
        ,('keystone', 'El Paso Natural Gas', 89317, 'STORAGE', 'WITHDRAWAL', -1)
        ,('keystone', 'Northern Natural Gas Pipeline', 103468, 'STORAGE', 'INJECTION', 1)
        ,('keystone', 'Northern Natural Gas Pipeline', 103439, 'STORAGE', 'WITHDRAWAL', -1)
        ,('keystone', 'Transwestern Pipeline Company', 121175, 'STORAGE', 'INJECTION', 1)
        ,('keystone', 'Transwestern Pipeline Company', 121207, 'STORAGE', 'WITHDRAWAL', -1)

        -- LA Storage
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147123, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147125, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147126, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147127, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147128, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147129, 'INTRASTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147130, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147131, 'INTRASTATE INTERCONNECT', 'DELIVERY', -1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147132, 'INTRASTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147133, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147134, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 147135, 'INTRASTATE INTERCONNECT', 'DELIVERY', -1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 428437, 'INTRASTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 428438, 'INTRASTATE INTERCONNECT', 'DELIVERY', -1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 454914, 'INTRASTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 456153, 'INTRASTATE INTERCONNECT', 'RECEIPT', 1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 459166, 'INTRASTATE INTERCONNECT', 'WITHDRAWAL', -1)
        ,('la_storage', 'LA Storage LLC (Formerly Liberty Gas Storage)', 459765, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)

        -- Leaf River
        ,('leaf_river', 'Leaf River Energy Center', 428334, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Mississippi Hub
        ,('mississippi_hub', 'Mississippi Hub LLC', 419195, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('mississippi_hub', 'Mississippi Hub LLC', 419196, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('mississippi_hub', 'Mississippi Hub LLC', 419197, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('mississippi_hub', 'Mississippi Hub LLC', 419198, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('mississippi_hub', 'Mississippi Hub LLC', 427240, 'INTERSTATE INTERCONNECT', 'RECEIPT', 1)
        ,('mississippi_hub', 'Mississippi Hub LLC', 427241, 'INTERSTATE INTERCONNECT', 'DELIVERY', -1)
        ,('mississippi_hub', 'Mississippi Hub LLC', 450635, 'POOL POINT', 'RECEIPT', 1)

        -- Moss Bluff Storage
        ,('moss_bluff', 'Texas Eastern Transmission Co', 105604, 'STORAGE', 'INJECTION', 1)
        ,('moss_bluff', 'Texas Eastern Transmission Co', 105608, 'STORAGE', 'WITHDRAWAL', -1)
        ,('moss_bluff', 'Natural Gas Pipeline Company of America, LLC', 120612, 'STORAGE', 'INJECTION', 1)
        ,('moss_bluff', 'Natural Gas Pipeline Company of America, LLC', 120176, 'STORAGE', 'WITHDRAWAL', -1)

        -- Perryville
        ,('perryville', 'Perryville Gas Storage', 435745, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Petal Storage
        ,('petal', 'Gulf South Pipeline Company LP', 146835, 'STORAGE', 'INJECTION', 1)
        ,('petal', 'Gulf South Pipeline Company LP', 146837, 'STORAGE', 'WITHDRAWAL', -1)

        -- Pine Prairie
        ,('pine_prarie', 'Pine Prairie Energy Center LLC', 147084, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Southern Pines
        ,('southern_pines', 'Southern Pines Energy Center', 406799, 'STORAGE', 'NET FAC WITHDRAWAL', -1)

        -- Tres Palacios
        ,('tres_palacios', 'Tres Palacios Gas Storage LLC', 147016, 'STORAGE', 'NET FAC WITHDRAWAL', -1)
) AS lookup_data(storage_facility_name, pipeline_name, location_role_id, facility, role, storage_sign)
