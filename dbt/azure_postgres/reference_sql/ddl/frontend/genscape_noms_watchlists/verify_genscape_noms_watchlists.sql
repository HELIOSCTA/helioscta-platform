SELECT
  table_schema,
  table_name
FROM information_schema.tables
WHERE table_schema = 'helioscta_app'
  AND table_name IN (
    'genscape_noms_watchlists',
    'genscape_noms_watchlist_roles'
  )
ORDER BY table_name;

SELECT
  indexname,
  tablename
FROM pg_indexes
WHERE schemaname = 'helioscta_app'
  AND tablename IN (
    'genscape_noms_watchlists',
    'genscape_noms_watchlist_roles'
  )
ORDER BY tablename, indexname;
