SELECT DISTINCT
  lr.location_role_id,
  p.short_name AS pipeline_short_name,
  le.tariff_zone,
  le.loc_name,
  lr.location_id,
  le.facility,
  lr.role
FROM natgas.location_role AS lr
LEFT JOIN natgas.location_extended AS le
  ON lr.location_id = le.location_id
LEFT JOIN natgas.pipelines AS p
  ON le.pipeline_id = p.pipeline_id
WHERE 1 = 1
  /*ROLE_ID_FILTER*/
  /*LOCATION_ID_FILTER*/
  /*PIPELINE_FILTER*/
  /*LOC_NAME_FILTER*/
  /*SEARCH_FILTER*/
ORDER BY lr.location_role_id
