WITH candidate_roles AS (
  SELECT
    lr.location_role_id
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
)
SELECT COUNT(*) AS total
FROM natgas.nominations AS noms
JOIN candidate_roles AS cr
  ON noms.location_role_id = cr.location_role_id
WHERE 1 = 1
  /*NOMS_ROLE_ID_FILTER*/
  /*DATE_FILTER*/
OPTION (RECOMPILE)
