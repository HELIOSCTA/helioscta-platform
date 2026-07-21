SELECT DISTINCT
  le.loc_name
FROM natgas.location_role AS lr
LEFT JOIN natgas.location_extended AS le
  ON lr.location_id = le.location_id
LEFT JOIN natgas.pipelines AS p
  ON le.pipeline_id = p.pipeline_id
WHERE le.loc_name IS NOT NULL
  /*ROLE_ID_FILTER*/
  /*LOCATION_ID_FILTER*/
  /*PIPELINE_FILTER*/
  /*LOC_NAME_FILTER*/
  /*SEARCH_FILTER*/
ORDER BY le.loc_name
