SELECT DISTINCT
  p.short_name AS pipeline_short_name
FROM natgas.location_role AS lr
LEFT JOIN natgas.location_extended AS le
  ON lr.location_id = le.location_id
LEFT JOIN natgas.pipelines AS p
  ON le.pipeline_id = p.pipeline_id
WHERE p.short_name IS NOT NULL
ORDER BY p.short_name
