-- Read-only Bloomberg DAPI shape and freshness checks.

SELECT
    COUNT(*) AS ticker_count,
    COUNT(*) FILTER (WHERE bloomberg_reference_fetched_at_utc IS NOT NULL) AS tickers_with_bloomberg_reference,
    MAX(updated_at) AS latest_ticker_update
FROM bbg_dapi.bbg_tickers;

SELECT
    category,
    subcategory,
    market,
    COUNT(*) AS ticker_count
FROM bbg_dapi.bbg_tickers
GROUP BY category, subcategory, market
ORDER BY category, subcategory, market;

SELECT
    data_type,
    COUNT(*) AS row_count,
    MIN(date) AS min_date,
    MAX(date) AS max_date,
    MAX(source_fetched_at_utc) AS latest_source_fetch,
    MAX(updated_at) AS latest_db_update
FROM bbg_dapi.bbg_historical
GROUP BY data_type
ORDER BY data_type;

SELECT
    h.security,
    COALESCE(
        NULLIF(BTRIM(t.bloomberg_security_description), ''),
        NULLIF(BTRIM(t.bloomberg_name), ''),
        NULLIF(BTRIM(t.description), ''),
        h.security
    ) AS description,
    t.category,
    t.subcategory,
    t.region,
    t.market,
    t.unit,
    h.data_type,
    MAX(h.date) AS latest_observation_date,
    COUNT(*) AS row_count,
    MAX(h.source_fetched_at_utc) AS latest_source_fetch
FROM bbg_dapi.bbg_historical h
LEFT JOIN bbg_dapi.bbg_tickers t
    ON t.security = h.security
GROUP BY
    h.security,
    COALESCE(
        NULLIF(BTRIM(t.bloomberg_security_description), ''),
        NULLIF(BTRIM(t.bloomberg_name), ''),
        NULLIF(BTRIM(t.description), ''),
        h.security
    ),
    t.category,
    t.subcategory,
    t.region,
    t.market,
    t.unit,
    h.data_type
ORDER BY h.security, h.data_type;
