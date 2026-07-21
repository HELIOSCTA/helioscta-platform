WITH candidate_roles AS (
  SELECT
    lr.location_role_id,
    lr.location_id,
    lr.role,
    lr.role_code,
    lr.meter,
    lr.drn,
    lr.sign,
    lr.best_storage,
    le.pipeline_id,
    p.name AS pipeline_name,
    p.short_name AS pipeline_short_name,
    le.tariff_zone,
    le.tz_id,
    le.state,
    le.county,
    le.loc_name,
    le.facility,
    le.interconnecting_entity,
    interconnect.short_name AS interconnecting_pipeline_short_name,
    le.latitude,
    le.longitude,
    le.location_best_flow
  FROM natgas.location_role AS lr
  LEFT JOIN natgas.location_extended AS le
    ON lr.location_id = le.location_id
  LEFT JOIN natgas.pipelines AS p
    ON le.pipeline_id = p.pipeline_id
  LEFT JOIN natgas.pipelines AS interconnect
    ON le.interconnecting_entity = interconnect.name
  WHERE 1 = 1
    /*ROLE_ID_FILTER*/
    /*LOCATION_ID_FILTER*/
    /*PIPELINE_FILTER*/
    /*LOC_NAME_FILTER*/
    /*SEARCH_FILTER*/
),
filtered_noms AS (
  SELECT
    noms.gas_day,
    noms.location_role_id,
    noms.cycle_code,
    noms.operational_cap,
    noms.available_cap,
    noms.scheduled_cap,
    noms.design_cap,
    noms.update_timestamp,
    noms.units,
    cr.pipeline_id,
    cr.pipeline_name,
    cr.pipeline_short_name,
    cr.tariff_zone,
    cr.tz_id,
    cr.state,
    cr.county,
    cr.loc_name,
    cr.location_id,
    cr.facility,
    cr.role,
    cr.role_code,
    cr.interconnecting_entity,
    cr.interconnecting_pipeline_short_name,
    cr.meter,
    cr.drn,
    cr.latitude,
    cr.longitude,
    cr.sign,
    cr.location_best_flow,
    cr.best_storage
  FROM natgas.nominations AS noms
  JOIN candidate_roles AS cr
    ON noms.location_role_id = cr.location_role_id
  WHERE 1 = 1
    /*NOMS_ROLE_ID_FILTER*/
    /*DATE_FILTER*/
)
SELECT
  noms.gas_day,
  noms.pipeline_id,
  noms.pipeline_name,
  noms.pipeline_short_name,
  noms.tariff_zone,
  noms.tz_id,
  noms.state,
  noms.county,
  noms.loc_name,
  noms.location_id,
  noms.location_role_id,
  noms.facility,
  noms.role,
  noms.role_code,
  noms.interconnecting_entity,
  noms.interconnecting_pipeline_short_name,
  noms.meter,
  noms.drn,
  noms.latitude,
  noms.longitude,
  noms.sign,
  noms.cycle_code,
  noms_cycles.name AS cycle_name,
  noms.units,
  noms.location_best_flow AS pipeline_balance_flag,
  noms.best_storage AS storage_flag,
  noms.scheduled_cap,
  noms.scheduled_cap * noms.sign AS signed_scheduled_cap,
  no_notice.no_notice_capacity,
  noms.operational_cap,
  noms.available_cap,
  noms.design_cap,
  noms.update_timestamp
FROM filtered_noms AS noms
LEFT JOIN natgas.nomination_cycles AS noms_cycles
  ON noms.cycle_code = noms_cycles.cycle_code
LEFT JOIN natgas.no_notice AS no_notice
  ON noms.location_role_id = no_notice.location_role_id
  AND noms.gas_day = no_notice.gas_day
ORDER BY noms.gas_day DESC, noms.pipeline_short_name, noms.loc_name
OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
OPTION (RECOMPILE)
