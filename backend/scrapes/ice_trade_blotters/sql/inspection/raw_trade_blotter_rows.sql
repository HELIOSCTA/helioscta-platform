-- Read-only raw ICE trade blotter row browser.
--
-- Purpose: visually inspect the loaded ICE Deal Report rows as another source
-- table. This query does not standardize products, accounts, contracts, sides,
-- or quantities.
--
-- Edit only the params CTE for ad hoc review filters.

WITH params AS (
    SELECT
        NULL::date AS start_trade_date,
        NULL::date AS end_trade_date,
        NULL::text AS trader,
        NULL::text AS hub,
        NULL::text AS contract,
        NULL::text AS product,
        1000::integer AS limit_rows
),
filtered AS (
    SELECT
        manifest.source_filename,
        manifest.stored_filename,
        manifest.loaded_at,
        trades.trade_date,
        trades.trade_time,
        trades.report_date,
        trades.deal_section,
        trades.deal_id,
        trades.leg_id,
        trades.orig_id,
        trades.link_id,
        trades.user_id,
        trades.trader,
        trades.b_s,
        trades.product,
        trades.hub,
        trades.contract,
        trades.begin_date,
        trades.end_date,
        trades.clearing_acct,
        trades.cust_acct,
        trades.clearing_firm,
        trades.price,
        trades.price_units,
        trades.option,
        trades.strike,
        trades.strike_2,
        trades.style,
        trades.lots,
        trades.total_quantity,
        trades.qty_units,
        trades.tt,
        trades.brk,
        trades.memo,
        trades.clearing_venue,
        trades.source,
        trades.usi,
        trades.authorized_trader_id,
        trades.location,
        trades.meter,
        trades.lead_time,
        trades.waiver_ind,
        trades.trade_time_micros,
        trades.cdi_override,
        trades.by_pass_mqr,
        trades.broker_name,
        trades.trading_company,
        trades.mic,
        trades.cc,
        trades.strip,
        trades.counterparty,
        trades.qty_per_period,
        trades.periods,
        trades.counterparty_user,
        trades.file_hash,
        trades.source_row_number,
        trades.source_row_hash,
        trades.created_at,
        trades.updated_at
    FROM ice_trade_blotter.ice_trade_blotter AS trades
    LEFT JOIN ice_trade_blotter.file_manifest AS manifest
        ON manifest.file_hash = trades.file_hash
    CROSS JOIN params
    WHERE (params.start_trade_date IS NULL OR trades.trade_date >= params.start_trade_date)
      AND (params.end_trade_date IS NULL OR trades.trade_date < params.end_trade_date)
      AND (params.trader IS NULL OR trades.trader = params.trader)
      AND (params.hub IS NULL OR trades.hub = params.hub)
      AND (params.contract IS NULL OR trades.contract = params.contract)
      AND (params.product IS NULL OR trades.product = params.product)
),
FINAL AS (
    SELECT *
    FROM filtered
)
SELECT *
FROM FINAL
ORDER BY
    trade_date DESC,
    report_date DESC,
    trade_time DESC,
    deal_id,
    source_row_number
LIMIT (SELECT limit_rows FROM params);
