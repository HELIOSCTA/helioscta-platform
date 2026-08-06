SELECT
  table_schema,
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'helioscta_app'
  AND table_name IN (
    'criterion_watchlists',
    'criterion_watchlist_items'
  )
ORDER BY table_name;

SELECT
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'helioscta_app'
  AND table_name IN (
    'criterion_watchlists',
    'criterion_watchlist_items'
  )
ORDER BY table_name, ordinal_position;

SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
JOIN pg_class c
  ON c.oid = con.conrelid
JOIN pg_namespace n
  ON n.oid = c.relnamespace
WHERE n.nspname = 'helioscta_app'
  AND c.relname IN (
    'criterion_watchlists',
    'criterion_watchlist_items'
  )
ORDER BY c.relname, con.contype, con.conname;

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'helioscta_app'
  AND tablename IN (
    'criterion_watchlists',
    'criterion_watchlist_items'
  )
ORDER BY tablename, indexname;

SELECT
  wl.watchlist_id,
  wl.watchlist_type,
  wl.source_system,
  wl.slug,
  wl.display_name,
  wl.is_active,
  count(wli.source_key) AS item_count,
  min(wli.created_at) AS first_item_created_at,
  max(wli.created_at) AS last_item_created_at
FROM helioscta_app.criterion_watchlists AS wl
LEFT JOIN helioscta_app.criterion_watchlist_items AS wli
  ON wli.watchlist_id = wl.watchlist_id
GROUP BY
  wl.watchlist_id,
  wl.watchlist_type,
  wl.source_system,
  wl.slug,
  wl.display_name,
  wl.is_active
ORDER BY wl.is_active DESC, wl.watchlist_type, wl.display_name;
