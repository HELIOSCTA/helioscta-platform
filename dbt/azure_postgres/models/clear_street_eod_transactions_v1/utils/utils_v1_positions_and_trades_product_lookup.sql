{{
  config(
    materialized='ephemeral'
  )
}}

-- -------------------------------------------------------------
-- -------------------------------------------------------------

SELECT * FROM (
    VALUES
    -- GAS - BALMO
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWING DAILY', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-1', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-2', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-3', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-4', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-5', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-6', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-7', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-8', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-9', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-10', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-11', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-12', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-13', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-14', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-15', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-16', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-17', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-18', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-19', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-20', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-21', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-22', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-23', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-24', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-25', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-26', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-27', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-28', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-29', 'HENRY SWING'),
    (NULL, 'HHD', NULL,  'BALMO', 'HENRY_HUB',                      'ICE NGAS HH SWG DLY DAY-30', 'HENRY SWING'),

    -- GAS - FUTURES - CME
    ('NG', 'NG',  NULL,  'GAS_FUTURES', 'HENRY_HUB',                'NATURAL GAS', 'NAT GAS'),
    ('IW', 'HH',  NULL,  'GAS_FUTURES', 'HENRY_HUB',                'GLOBEX NATURAL GAS LD', 'NAT GAS LAST DAY FINAN'),
    ('IW', 'HH',  NULL,  'GAS_FUTURES', 'HENRY_HUB',                'NYMEX HENRY HUB FINANCIAL LDO', 'NAT GAS LAST DAY FINAN'),
    ('ZA', 'HP',  NULL,  'GAS_FUTURES', 'HENRY_HUB',                'NYMEX HENRY HUB NATURAL GAS', 'HENRY HUB FINANCIAL'),
    ('ZA', 'HP',  NULL,  'GAS_FUTURES', 'HENRY_HUB',                'HENRY PENULTIMATE NATURAL GAS', 'HENRY HUB FINANCIAL'),

    -- GAS - FUTURES - ICE
    (NULL, 'H',   NULL, 'GAS_FUTURES', 'HENRY_HUB',               'NATURAL GAS LD1 FUTURE', 'HENRY LD1 FIXED'),
    (NULL, 'H',   NULL, 'GAS_FUTURES', 'HENRY_HUB',               'HENRY HUB NATURAL GAS', 'HENRY LD1 FIXED'),
    (NULL, 'PHH', NULL, 'GAS_FUTURES', 'HENRY_HUB',               'ICE PHH', 'HENRY PENULT FIXED'),

    -- GAS - OPTIONS - ICE
    (NULL, 'PHE', 'NG', 'GAS_OPTIONS', 'HENRY_HUB',                'ICE PHE', 'HENRY PENULT FIXED'),
    (NULL, 'PHE', 'NG', 'GAS_OPTIONS', 'HENRY_HUB',                'ICE HH EQ', 'HENRY PENULT FIXED'),
    (NULL, 'PHE', 'NG', 'GAS_OPTIONS', 'HENRY_HUB',                'ICE NGAS PEN HENRY HUB', 'HENRY PENULT FIXED'),
    -- (NULL, 'PHE', 'NG', 'GAS_OPTIONS', 'HENRY_HUB',                'NATURAL GAS CLEARPORT', 'HENRY PENULT FIXED'),

    -- GAS - OPTIONS - CME
    ('NG', 'LN',  'NG', 'GAS_OPTIONS', 'HENRY_HUB',                 'NYM EUR NATURAL GAS', 'EUR NAT GAS'),
    ('NG', 'LN',  'NG', 'GAS_OPTIONS', 'HENRY_HUB',                 'NATURAL GAS CLEARPORT', 'EUR NAT GAS'),

    -- GAS - OPTIONS - WEEKLY - CME
    ('NGW', 'LN1', 'NG', 'GAS_OPTIONS', 'HENRY_HUB',                'NATURAL GAS FINANCIAL Week 1', 'NAT GAS FIN WKLY WK1'),
    ('NGW', 'LN2', 'NG', 'GAS_OPTIONS', 'HENRY_HUB',                'NATURAL GAS FINANCIAL Week 2', 'NAT GAS FIN WKLY WK2'),
    ('NGW', 'LN3', 'NG', 'GAS_OPTIONS', 'HENRY_HUB',                'NATURAL GAS FINANCIAL Week 3', 'NAT GAS FIN WKLY WK3'),
    ('NGW', 'LN4', 'NG', 'GAS_OPTIONS', 'HENRY_HUB',                'NATURAL GAS FINANCIAL Week 4', 'NAT GAS FIN WKLY WK4'),
    ('NGW', 'LN5', 'NG', 'GAS_OPTIONS', 'HENRY_HUB',                'NATURAL GAS FINANCIAL Week 5', 'NAT GAS FIN WKLY WK5'),

    -- GAS - OPTIONS - DAILY - CME
    ('HZI', 'KN4', 'NG', 'GAS_OPTIONS', 'HENRY_HUB',                'NATURAL GAS FINANCIAL Week 4', 'NAT GAS FIN WKLY WK4'),

    -- GAS - OPTIONS - CAL SPREADS - CME
    (NULL, 'G3', 'NG', 'GAS_OPTIONS', 'HENRY_HUB',                 'NATURAL GAS 3M CSO', 'NAT GAS CAL SPRD FIN 3MO'),
    (NULL, 'G4', 'NG', 'GAS_OPTIONS', 'HENRY_HUB',                 'NATURAL GAS FINANCIAL 1M SO', 'NAT GAS FINAN 1 MNTH SPRD'),
    (NULL, 'G4', 'NG', 'GAS_OPTIONS', 'HENRY_HUB',                 'NATURAL GAS 1M CSO', 'NAT GAS FINAN 1 MNTH SPRD'),

    -- PJM RT
    (NULL, 'PDP', NULL, 'SHORT_TERM_POWER', 'PJM',                   'ICE PJM WH RTD', 'PJM WH REAL T PEAK DAILY'),
    (NULL, 'PWA', NULL, 'SHORT_TERM_POWER', 'PJM',                   'ICE PWA', 'PJM W HUB RT PEAK DAILY'),
    (NULL, 'DDP', NULL, 'SHORT_TERM_POWER', 'PJM',                   NULL, 'PJM AEP DAYTHUB PEAK DLY'),

    -- PJM DA
    (NULL, 'PDA', NULL, 'POWER_FUTURES', 'PJM',                      'ICE PJMWHPKDAY', 'PJM WEST DAY AHEAD PK DA'),
    (NULL, 'PJL', NULL, 'POWER_FUTURES', 'PJM',                      'ICE PJL', 'PJM WST HUB D APDM FP FU'),

    -- PJM: PMI
    (NULL, 'PMI', 'PMI', 'POWER_FUTURES', 'PJM',                    'ICE PJM MINI', 'PJM WST HUB REAL PEAK FIXED'),
    (NULL, 'PMI', 'PMI', 'POWER_FUTURES', 'PJM',                    'ICE PJM MINI-352', 'PJM WST HUB REAL PEAK FIXED'),
    (NULL, 'PMI', 'PMI', 'POWER_FUTURES', 'PJM',                    'ICE MINIPJMRT-320', 'PJM WST HUB REAL PEAK FIXED'),
    (NULL, 'PMI', 'PMI', 'POWER_FUTURES', 'PJM',                    'ICE PJM WHREAL TYM PK MINI-352', 'PJM WST HUB REAL PEAK FIXED'),
    (NULL, 'PMI', 'PMI', 'POWER_FUTURES', 'PJM',                    'ICE PJM WHREAL TYM PK MINI-336', 'PJM WST HUB REAL PEAK FIXED'),
    (NULL, 'PMI', 'PMI', 'POWER_FUTURES', 'PJM',                    'ICE PJM WHREAL TYM PK MINI-320', 'PJM WST HUB REAL PEAK FIXED'),
    (NULL, 'PMI', 'PMI', 'POWER_FUTURES', 'PJM',                    'ICE PJM WHREAL TYM PK MINI-304', 'PJM WST HUB REAL PEAK FIXED'),

    -- PJM: Put Spread
    (NULL, 'P1X', 'PMI', 'POWER_OPTIONS', 'PJM',                    'ICE PJM WHRT PEAK OPT_4096', 'PJM WEST HUB RT'),

    -- PJM OFFPEAK: OPJ
    (NULL, 'OPJ', NULL, 'POWER_FUTURES', 'PJM',                    'ICE PJM OFF PK-392', 'PJM WST HUB REAL OFF PEAK FIXED'),
    (NULL, 'OPJ', NULL, 'POWER_FUTURES', 'PJM',                    'ICE PJM OFF PK-417', 'PJM WST HUB REAL OFF PEAK FIXED'),
    (NULL, 'OPJ', NULL, 'POWER_FUTURES', 'PJM',                    'ICE PJM OFF PK_376', 'PJM WST HUB REAL OFF PEAK FIXED'),
    (NULL, 'OPJ', NULL, 'POWER_FUTURES', 'PJM',                    'ICE PJM OFF PK_384', 'PJM WST HUB REAL OFF PEAK FIXED'),
    (NULL, 'OPJ', NULL, 'POWER_FUTURES', 'PJM',                    'ICE PJM OFF PK_408', 'PJM WST HUB REAL OFF PEAK FIXED'),
    (NULL, 'OPJ', NULL, 'POWER_FUTURES', 'PJM',                    'ICE PJM OFF PK-401', 'PJM WST HUB REAL OFF PEAK FIXED'),
    (NULL, 'OPJ', NULL, 'POWER_FUTURES', 'PJM',                    'ICE PJM OFF PK_368', 'PJM WST HUB REAL OFF PEAK FIXED'),
    (NULL, 'OPJ', NULL, 'POWER_FUTURES', 'PJM',                    'ICE PJM OFF PK-352', 'PJM WST HUB REAL OFF PEAK FIXED'),
    (NULL, 'OPJ', NULL, 'POWER_FUTURES', 'PJM',                    'ICE PJM OFF PK-424', 'PJM WST HUB REAL OFF PEAK FIXED'),
    (NULL, 'OPJ', NULL, 'POWER_FUTURES', 'PJM',                    'ICE PJM OFF PK_375', 'PJM WST HUB REAL OFF PEAK FIXED'),
    (NULL, 'OPJ', NULL, 'POWER_FUTURES', 'PJM',                    'ICE PJM OFF PK_385', 'PJM WST HUB REAL OFF PEAK FIXED'),

    -- PJM OFFPEAK: ODP ... PJM Western Hub Real-Time Off-Peak Daily Fixed Price Future
    (NULL, 'ODP', NULL, 'POWER_FUTURES', 'PJM',                 NULL, 'PJM WH OFF-PEAK DAILY'),

    -- ERCOT RT
    (NULL,'ERA', NULL, 'SHORT_TERM_POWER', 'ERCOT',               'ICE ERA', 'EMINI ERCOT 345RT PK DAILY'),

    -- ERCOT: ERN
    (NULL,'ERN', NULL, 'POWER_FUTURES', 'ERCOT',                  'ERCOT N 345 KV RT PEAK DLY', 'ERCOT NORTH PEAK FIXED'),

    -- ERCOT OFFPEAK: ECI
    (NULL, 'ECI', NULL, 'POWER_FUTURES', 'ERCOT',                  'ICE ERCOT NORTH 345KV 7x8-248', 'ERCT NORTH 345KVRT 7x8 FXD'),
    (NULL, 'ECI', NULL, 'POWER_FUTURES', 'ERCOT',                  'ICE ERCOT NORTH 345KV 7x8-224', 'ERCT NORTH 345KVRT 7x8 FXD'),
    (NULL, 'ECI', NULL, 'POWER_FUTURES', 'ERCOT',                  'ICE ERCOT NORTH 345KV 7x8-247', 'ERCT NORTH 345KVRT 7x8 FXD'),
    (NULL, 'ECI', NULL, 'POWER_FUTURES', 'ERCOT',                  'ICE ERCOT NORTH 345KV 7x8-240', 'ERCT NORTH 345KVRT 7x8 FXD'),
    (NULL, 'ECI', NULL, 'POWER_FUTURES', 'ERCOT',                  'ICE ERCOT NORTH 345KV 7x8-241', 'ERCT NORTH 345KVRT 7x8 FXD'),

    -- NEPOOL
    (NULL, 'NEZ', NULL, 'SHORT_TERM_POWER', 'NEPOOL',               NULL, 'ISO NEW ENG MASS MINI FU'),
    (NULL, 'NEP', NULL, 'POWER_FUTURES', 'NEPOOL',                  'ISO ENG MASS HUB D-PK-320', 'ISO MASS HUB PEAK FIXED'),
    (NULL, 'NEP', NULL, 'POWER_FUTURES', 'NEPOOL',                  'ICE NEPOOL PK MNTH-320', 'ISO MASS HUB PEAK FIXED'),
    (NULL, 'NEP', NULL, 'POWER_FUTURES', 'NEPOOL',                  'ISO ENG MASS HUB D-PK-336', 'ISO MASS HUB PEAK FIXED'),
    (NULL, 'NEP', NULL, 'POWER_FUTURES', 'NEPOOL',                  'ISO ENG MASS HUB D-PK-352', 'ISO MASS HUB PEAK FIXED'),
    (NULL, 'NEP', NULL, 'POWER_FUTURES', 'NEPOOL',                  'ICE NEPOOL PK MNTH-368', 'ISO MASS HUB PEAK FIXED'),

    -- CAISO
    (NULL, 'SPM', NULL, 'POWER_FUTURES', 'CAISO',                  'ICE SP 15 PEAK', 'CAISO SP15 PEAK FIXED'),
    (NULL, 'SPM', NULL, 'POWER_FUTURES', 'CAISO',                  'ICE SP 15 PEAK_384', 'CAISO SP15 PEAK FIXED'),
    (NULL, 'SPM', NULL, 'POWER_FUTURES', 'CAISO',                  'ICE SP 15 PEAK_400', 'CAISO SP15 PEAK FIXED'),
    (NULL, 'SPM', NULL, 'POWER_FUTURES', 'CAISO',                  'ICE SP 15 PEAK_416', 'CAISO SP15 PEAK FIXED'),
    (NULL, 'SPM', NULL, 'POWER_FUTURES', 'CAISO',                  'ICE SP 15 PEAK_432', 'CAISO SP15 PEAK FIXED'),
    (NULL, 'NPM', NULL, 'POWER_FUTURES', 'CAISO',                  'ICE NP 15 PEAK', 'CAISO NP15 PEAK FIXED'),
    (NULL, 'NPM', NULL, 'POWER_FUTURES', 'CAISO',                  'ICE NP 15 PEAK_384', 'CAISO NP15 PEAK FIXED'),
    (NULL, 'NPM', NULL, 'POWER_FUTURES', 'CAISO',                  'ICE NP 15 PEAK_416', 'CAISO NP15 PEAK FIXED'),
    (NULL, 'NPM', NULL, 'POWER_FUTURES', 'CAISO',                  'ICE NP 15 PEAK_432', 'CAISO NP15 PEAK FIXED'),

    -- PAC NW
    (NULL, 'MDC', NULL, 'POWER_FUTURES', 'PAC_NW',                  'ICE MID-C PEAK', 'MID C FIN PEAK ELEC'),
    (NULL, 'MDC', NULL, 'POWER_FUTURES', 'PAC_NW',                  'ICE MID-C PEAK_400', 'MID C FIN PEAK ELEC'),
    (NULL, 'MDC', NULL, 'POWER_FUTURES', 'PAC_NW',                  'ICE MID-C PEAK_416', 'MID C FIN PEAK ELEC'),

    -- ICE GAS / BASIS
    (NULL, 'AEC', NULL, 'BASIS', 'BASIS',                           'AB NIT BASIS FUTURE', 'AB NIT BASIS'),
    (NULL, 'ALQ', NULL, 'BASIS', 'BASIS',                           'ICE ALQCTYGTSW', 'ALGONQUIN CITYGATES BASIS'),
    (NULL, 'CRI', NULL, 'BASIS', 'BASIS',                           'ICE CIG ROCKIES BASIS', 'CIG ROCKIES BASIS'),
    (NULL, 'DGD', NULL, 'BASIS', 'BASIS',                           'ICE CHICAGO BASIS FUT', 'CHICAGO BASIS'),
    (NULL, 'DOM', NULL, 'BASIS', 'BASIS',                           'ICE EASTERN GAS SOUTH BASIS FU', 'DOMINION SOUTH BASIS'),
    (NULL, 'HXS', NULL, 'BASIS', 'BASIS',                           'ICE HSC BASIS', 'HSC BASIS'),
    (NULL, 'UCS', NULL, 'BASIS', 'BASIS',                           NULL, 'HSC SWING'),
    (NULL, 'NTO', NULL, 'BASIS', 'BASIS',                           'NGPL TXOK BASIS FUTURE', 'NGPL TXOK BASIS'),
    (NULL, 'NWR', NULL, 'BASIS', 'BASIS',                           'ICE NGAS NYM NWP RK', 'NAT GAS B/S FERC;ROCKIES'),
    (NULL, 'PGE', NULL, 'BASIS', 'BASIS',                           'ICE NGAS NYM PG&E', 'PG&E CITYGATE BASIS'),
    (NULL, 'TMT', NULL, 'BASIS', 'BASIS',                           'ICE TETCO SWP', 'TETCO M3 BASIS'),
    (NULL, 'TRZ', NULL, 'BASIS', 'BASIS',                           'ICE TRANSCO STATION 85 ZONE 4', 'TRANSCO 85 Z4 BASIS'),
    (NULL, 'TRZ', NULL, 'BASIS', 'BASIS',                           'ICE TCOZN4BASI', 'TRANSCO 85 Z4 BASIS')

) AS lookup_data(bbg_exchange_code, exchange_code, exchange_code_underlying, exchange_code_grouping, exchange_code_region, nav_product, marex_product)
