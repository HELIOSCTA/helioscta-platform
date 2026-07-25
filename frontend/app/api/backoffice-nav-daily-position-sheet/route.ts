import { observedJsonRoute, type ObservedRouteResult } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import {
  loadPromotedNavPositionsSql,
  loadPromotedNavPositionsAllHistorySql,
  selectedNavPositionsCte,
} from "@/lib/server/navPositionsSql";
import {
  getCachedRouteValue,
  normalizedSearchCacheKey,
  routeCacheHeaders,
} from "@/lib/server/routeCache";
import type {
  BackOfficeNavDailyPositionSheetAccountColumn,
  BackOfficeNavDailyPositionSheetAvailableDate,
  BackOfficeNavDailyPositionSheetGasCell,
  BackOfficeNavDailyPositionSheetGasRow,
  BackOfficeNavDailyPositionSheetMetric,
  BackOfficeNavDailyPositionSheetOptionMonth,
  BackOfficeNavDailyPositionSheetOptionRow,
  BackOfficeNavDailyPositionSheetPayload,
} from "@/lib/positionsAndTrades/backOfficeNavDailyPositionSheetTypes";

export const runtime = "nodejs";
export const maxDuration = 30;

const LATEST_CACHE_TTL_SECONDS = 60;
const HISTORICAL_CACHE_TTL_SECONDS = 60 * 60;
const STALE_IF_ERROR_MS = 30 * 60 * 1000;
const CACHE_HEADER = `private, max-age=${LATEST_CACHE_TTL_SECONDS}, stale-while-revalidate=${LATEST_CACHE_TTL_SECONDS}`;
const NO_STORE_HEADER = "no-store";
const DISPLAY_TIME_ZONE = "America/New_York";
const SOURCE_CHECKS =
  "Sources: NAV Positions Frontend Contract; gas quantity and gas lots are derived upstream in dbt.";
const GAS_PRODUCT_CODES = ["PHH", "NG", "HP", "HH", "H"] as const;
const ALL_TOTAL_KEY = "ALL";
const ACCOUNT_COLUMNS: BackOfficeNavDailyPositionSheetAccountColumn[] = [
  { key: "ACIM", label: "ACIM / UBE 10051", productCodes: [...GAS_PRODUCT_CODES] },
  { key: "PNT", label: "PNT / ABN AMRO_1251PT034", productCodes: [...GAS_PRODUCT_CODES] },
  { key: "DICKSON", label: "DICKSON / RJO_35511229", productCodes: [...GAS_PRODUCT_CODES] },
  { key: "TITAN", label: "TITAN / 969 ESKHL", productCodes: [...GAS_PRODUCT_CODES] },
];

interface AvailableDateDbRow {
  nav_date: string;
  row_count: number | string;
  latest_upload_at: string | null;
}

interface MatrixBundleDbRow {
  summary: unknown;
  gas_futures: unknown;
  option_positions: unknown;
}

interface SummaryRow {
  selected_date: string | null;
  nav_updated_at: string | null;
  row_count: number | string | null;
  gas_active_future_quantity: number | string | null;
  missing_expiry_count: number | string | null;
  unknown_account_count: number | string | null;
  excluded_future_count: number | string | null;
  excluded_option_count: number | string | null;
  unknown_option_account_count: number | string | null;
  option_active_rows: number | string | null;
}

interface GasFutureRow {
  contract_yyyymm: string | null;
  account_name: string | null;
  product_code: string | null;
  quantity: number | string | null;
  gas_lots: number | string | null;
}

interface OptionPositionRow {
  exchange: string | null;
  contract_yyyymm: string | null;
  strike: number | string | null;
  put_call: string | null;
  quantity: number | string | null;
  settlement_price: number | string | null;
  daily_change: number | string | null;
  settle_pnl: number | string | null;
  top_account: string | null;
  top_account_quantity: number | string | null;
}

type OptionRowAccumulator = BackOfficeNavDailyPositionSheetOptionRow & {
  topAccountMagnitude: number;
};

function responseHeaders(forceRefresh: boolean, cacheTtlSeconds = LATEST_CACHE_TTL_SECONDS): HeadersInit {
  return {
    "Cache-Control": forceRefresh
      ? NO_STORE_HEADER
      : `private, max-age=${cacheTtlSeconds}, stale-while-revalidate=${cacheTtlSeconds}`,
    "Vercel-CDN-Cache-Control": NO_STORE_HEADER,
    "X-Helios-Cache-Policy": forceRefresh
      ? "no-store"
      : `browser-cache=${cacheTtlSeconds}, vercel-cdn no-store`,
  };
}

function toNumber(value: unknown): number {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: unknown, digits = 0): number {
  const parsed = toNumber(value);
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function roundOptional(value: unknown, digits = 0): number | null {
  const parsed = toOptionalNumber(value);
  if (parsed == null) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function rowArray<T extends object>(value: unknown): T[] {
  return Array.isArray(value)
    ? value.filter((item): item is T => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseDateParam(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseYyyymmParam(value: string | null): string | null {
  return value && /^\d{6}$/.test(value) ? value : null;
}

function localIsoDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function formatDateOnly(value: string | null): string {
  if (!value) return "--";
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMonth(yyyymm: string): string {
  const year = Number.parseInt(yyyymm.slice(0, 4), 10);
  const month = Number.parseInt(yyyymm.slice(4, 6), 10);
  if (!year || !month) return yyyymm;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    year: "2-digit",
  });
}

function formatTimestamp(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatQuantityLabel(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function topAccountLabel(account: string | null, quantity: unknown): string | null {
  if (!account) return null;
  const parsedQuantity = toOptionalNumber(quantity);
  return parsedQuantity == null ? account : `${account} ${formatQuantityLabel(round(parsedQuantity, 2))}`;
}

function accountKey(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return ACCOUNT_COLUMNS.some((column) => column.key === normalized && column.key !== "ALL")
    ? normalized
    : null;
}

function emptyCell(): BackOfficeNavDailyPositionSheetGasCell {
  return { quantity: 0, gasLots: null };
}

function emptyValueGrid(): Record<string, Record<string, BackOfficeNavDailyPositionSheetGasCell>> {
  return Object.fromEntries(
    ACCOUNT_COLUMNS.map((account) => [
      account.key,
      Object.fromEntries(GAS_PRODUCT_CODES.map((productCode) => [productCode, emptyCell()])),
    ]),
  );
}

function emptyTotals(): Record<string, number> {
  return {
    ...Object.fromEntries(ACCOUNT_COLUMNS.map((account) => [account.key, 0])),
    [ALL_TOTAL_KEY]: 0,
  };
}

function emptyProductTotals(): Record<string, number> {
  return Object.fromEntries(GAS_PRODUCT_CODES.map((productCode) => [productCode, 0]));
}

async function loadAvailableDates(): Promise<BackOfficeNavDailyPositionSheetAvailableDate[]> {
  const rows = await query<AvailableDateDbRow>(`
    SELECT
      to_char(nav_date, 'YYYY-MM-DD') AS nav_date,
      count(*)::integer AS row_count,
      max(sftp_upload_timestamp)::text AS latest_upload_at
    FROM nav.positions
    GROUP BY nav_date
    ORDER BY nav_date DESC
    LIMIT 90
  `);
  return rows.map((row) => {
    const rowCount = toNumber(row.row_count);
    return {
      navDate: row.nav_date,
      navDateLabel: formatDateOnly(row.nav_date),
      rowCount,
      rowCountLabel: formatCount(rowCount),
      latestUploadAt: row.latest_upload_at,
      latestUploadLabel: formatTimestamp(row.latest_upload_at),
    };
  });
}

async function loadOptionPositionsForDailyChange(selectedDate: string | null): Promise<OptionPositionRow[]> {
  const allHistoryArtifact = await loadPromotedNavPositionsAllHistorySql();
  return query<OptionPositionRow>(
    `
    WITH params AS (
      SELECT $1::date AS selected_nav_date
    ),
    modelled_nav_positions AS (
      ${allHistoryArtifact.sql}
    ),
    candidate_positions AS MATERIALIZED (
      SELECT
        nav_date,
        sftp_upload_timestamp,
        fund_code,
        account_name,
        product_code,
        underlying_product_code,
        contract_yyyymm,
        put_call,
        normalized_strike_price,
        gas_qty,
        gas_lots,
        trade_price,
        market_settlement_price
      FROM modelled_nav_positions
      CROSS JOIN params
      WHERE (params.selected_nav_date IS NULL OR nav_date <= params.selected_nav_date)
        AND put_call IS NOT NULL
        AND contract_yyyymm IS NOT NULL
        AND normalized_strike_price IS NOT NULL
        AND product_code IN ('LN', 'PHE')
    ),
    selected_nav_date AS (
      SELECT coalesce(
        (SELECT selected_nav_date FROM params),
        max(nav_date)
      ) AS nav_date
      FROM candidate_positions
    ),
    latest_two_dates AS (
      SELECT DISTINCT candidate_positions.nav_date
      FROM candidate_positions
      CROSS JOIN selected_nav_date
      WHERE candidate_positions.nav_date <= selected_nav_date.nav_date
      ORDER BY candidate_positions.nav_date DESC
      LIMIT 2
    ),
    latest_upload_by_fund AS (
      SELECT
        candidate_positions.fund_code,
        candidate_positions.nav_date,
        max(candidate_positions.sftp_upload_timestamp) AS sftp_upload_timestamp
      FROM candidate_positions
      INNER JOIN latest_two_dates
        ON latest_two_dates.nav_date = candidate_positions.nav_date
      GROUP BY candidate_positions.fund_code, candidate_positions.nav_date
    ),
    position_rows AS MATERIALIZED (
      SELECT candidate_positions.*
      FROM candidate_positions
      INNER JOIN latest_upload_by_fund
        ON latest_upload_by_fund.fund_code = candidate_positions.fund_code
        AND latest_upload_by_fund.nav_date = candidate_positions.nav_date
        AND latest_upload_by_fund.sftp_upload_timestamp = candidate_positions.sftp_upload_timestamp
    ),
    grouped_positions AS (
      SELECT
        md5(concat_ws(
          '||',
          coalesce(product_code, underlying_product_code, '<null>'),
          coalesce(put_call, '<null>'),
          coalesce(normalized_strike_price::text, '<null>'),
          coalesce(contract_yyyymm, '<null>'),
          coalesce(gas_lots::text, '<null>')
        )) AS position_group_key,
        nav_date,
        coalesce(product_code, underlying_product_code, 'UNKNOWN') AS exchange,
        put_call,
        normalized_strike_price::double precision AS strike,
        contract_yyyymm,
        gas_lots::double precision AS lots,
        avg(market_settlement_price)::double precision AS settlement_price_total,
        avg(trade_price)::double precision AS trade_price_total,
        sum(coalesce(gas_qty, 0))::double precision AS qty_total,
        sum(case when account_name = 'ACIM' then coalesce(gas_qty, 0) else 0 end)::double precision AS qty_acim,
        sum(case when account_name = 'PNT' then coalesce(gas_qty, 0) else 0 end)::double precision AS qty_pnt,
        sum(case when account_name = 'DICKSON' then coalesce(gas_qty, 0) else 0 end)::double precision AS qty_dickson,
        sum(case when account_name = 'TITAN' then coalesce(gas_qty, 0) else 0 end)::double precision AS qty_titan
      FROM position_rows
      GROUP BY
        nav_date,
        coalesce(product_code, underlying_product_code, 'UNKNOWN'),
        product_code,
        underlying_product_code,
        put_call,
        normalized_strike_price,
        contract_yyyymm,
        gas_lots
    ),
    with_previous AS (
      SELECT
        lag(nav_date, 1) OVER (
          PARTITION BY position_group_key
          ORDER BY nav_date
        ) AS previous_nav_date,
        lag(settlement_price_total, 1) OVER (
          PARTITION BY position_group_key
          ORDER BY nav_date
        ) AS previous_settlement_price_total,
        grouped_positions.*
      FROM grouped_positions
    ),
    selected_option_rows AS (
      SELECT
        with_previous.exchange,
        with_previous.contract_yyyymm,
        with_previous.strike,
        with_previous.put_call,
        with_previous.qty_total AS quantity,
        with_previous.settlement_price_total AS settlement_price,
        case
          when with_previous.previous_nav_date IS NOT NULL
          then with_previous.settlement_price_total - with_previous.previous_settlement_price_total
          when with_previous.previous_nav_date IS NULL and with_previous.trade_price_total IS NOT NULL
          then with_previous.settlement_price_total - with_previous.trade_price_total
        end AS daily_change,
        case
          when with_previous.previous_nav_date IS NOT NULL
          then (with_previous.settlement_price_total - with_previous.previous_settlement_price_total)
            * with_previous.qty_total
            * with_previous.lots
          when with_previous.previous_nav_date IS NULL and with_previous.trade_price_total IS NOT NULL
          then (with_previous.settlement_price_total - with_previous.trade_price_total)
            * with_previous.qty_total
            * with_previous.lots
        end AS settle_pnl,
        with_previous.qty_acim,
        with_previous.qty_pnt,
        with_previous.qty_dickson,
        with_previous.qty_titan
      FROM with_previous
      CROSS JOIN selected_nav_date
      WHERE with_previous.nav_date = selected_nav_date.nav_date
    ),
    account_quantities AS (
      SELECT
        exchange,
        contract_yyyymm,
        strike,
        account_name,
        sum(account_quantity)::double precision AS account_quantity
      FROM (
        SELECT exchange, contract_yyyymm, strike, 'ACIM' AS account_name, qty_acim AS account_quantity
        FROM selected_option_rows
        UNION ALL
        SELECT exchange, contract_yyyymm, strike, 'PNT' AS account_name, qty_pnt AS account_quantity
        FROM selected_option_rows
        UNION ALL
        SELECT exchange, contract_yyyymm, strike, 'DICKSON' AS account_name, qty_dickson AS account_quantity
        FROM selected_option_rows
        UNION ALL
        SELECT exchange, contract_yyyymm, strike, 'TITAN' AS account_name, qty_titan AS account_quantity
        FROM selected_option_rows
      ) account_source
      WHERE account_quantity <> 0
      GROUP BY exchange, contract_yyyymm, strike, account_name
    ),
    ranked_accounts AS (
      SELECT
        account_quantities.*,
        row_number() OVER (
          PARTITION BY exchange, contract_yyyymm, strike
          ORDER BY abs(account_quantity) DESC, account_name
        ) AS account_rank
      FROM account_quantities
    ),
    FINAL AS (
      SELECT
        selected_option_rows.exchange,
        selected_option_rows.contract_yyyymm,
        selected_option_rows.strike,
        selected_option_rows.put_call,
        selected_option_rows.quantity,
        selected_option_rows.settlement_price,
        selected_option_rows.daily_change,
        selected_option_rows.settle_pnl,
        ranked_accounts.account_name AS top_account,
        ranked_accounts.account_quantity AS top_account_quantity
      FROM selected_option_rows
      LEFT JOIN ranked_accounts
        ON ranked_accounts.exchange = selected_option_rows.exchange
        AND ranked_accounts.contract_yyyymm = selected_option_rows.contract_yyyymm
        AND ranked_accounts.strike = selected_option_rows.strike
        AND ranked_accounts.account_rank = 1
    )
    SELECT *
    FROM FINAL
    ORDER BY contract_yyyymm, exchange, strike, put_call
    `,
    [selectedDate],
  );
}

async function loadMatrixBundle(requestedDate: string | null): Promise<MatrixBundleDbRow> {
  const promotedArtifact = await loadPromotedNavPositionsSql({ requestedDate });
  const selectedPositionsSql = selectedNavPositionsCte(promotedArtifact.sql);
  const args = [
    requestedDate,
    null,
    null,
    null,
    ["gas", "basis"],
    [],
    [],
    null,
    null,
  ];
  const rows = await query<MatrixBundleDbRow>(
    `
    ${selectedPositionsSql}
    SELECT
      (
        SELECT to_jsonb(summary_row)
        FROM (
          SELECT
            to_char(max(nav_date), 'YYYY-MM-DD') AS selected_date,
            max(coalesce(updated_at, sftp_upload_timestamp))::text AS nav_updated_at,
            count(*)::integer AS row_count,
            sum(coalesce(gas_qty, 0)) FILTER (
              WHERE put_call IS NULL
                AND contract_yyyymm IS NOT NULL
                AND contract_day IS NULL
                AND product_code IN ('PHH', 'NG', 'HP', 'HH', 'H')
            )::double precision AS gas_active_future_quantity,
            count(*) FILTER (
              WHERE is_product_record
                AND contract_yyyymm IS NULL
            )::integer AS missing_expiry_count,
            count(*) FILTER (
              WHERE coalesce(account_lookup_status, '') <> 'matched'
            )::integer AS unknown_account_count,
            count(*) FILTER (
              WHERE put_call IS NULL
                AND contract_yyyymm IS NOT NULL
                AND contract_day IS NULL
                AND product_code = 'PGE'
            )::integer AS excluded_future_count,
            count(*) FILTER (
              WHERE put_call IS NOT NULL
                AND coalesce(product_code, '') NOT IN ('LN', 'PHE')
            )::integer AS excluded_option_count,
            count(*) FILTER (
              WHERE put_call IS NOT NULL
                AND coalesce(account_lookup_status, '') <> 'matched'
            )::integer AS unknown_option_account_count,
            count(*) FILTER (WHERE put_call IS NOT NULL)::integer AS option_active_rows
          FROM selected_positions
        ) summary_row
      ) AS summary,
      (
        SELECT coalesce(jsonb_agg(to_jsonb(future_row) ORDER BY
          contract_yyyymm,
          account_name,
          product_code
        ), '[]'::jsonb)
        FROM (
          SELECT
            contract_yyyymm,
            account_name,
            product_code,
            sum(coalesce(gas_qty, 0))::double precision AS quantity,
            max(gas_lots)::double precision AS gas_lots
          FROM selected_positions
          WHERE put_call IS NULL
            AND contract_yyyymm IS NOT NULL
            AND contract_day IS NULL
            AND product_code IN ('PHH', 'NG', 'HP', 'HH', 'H')
          GROUP BY contract_yyyymm, account_name, product_code
        ) future_row
      ) AS gas_futures,
      '[]'::jsonb AS option_positions
    `,
    args,
  );
  const bundle = rows[0] ?? { summary: {}, gas_futures: [], option_positions: [] };
  const summary = objectRecord(bundle.summary) as unknown as SummaryRow;
  return {
    ...bundle,
    option_positions: await loadOptionPositionsForDailyChange(summary.selected_date ?? requestedDate),
  };
}

function gasMatrixRows(rows: GasFutureRow[]): {
  rows: BackOfficeNavDailyPositionSheetGasRow[];
  totalRow: Record<string, Record<string, BackOfficeNavDailyPositionSheetGasCell>>;
  accountTotals: Record<string, number>;
  productTotals: Record<string, number>;
  total: number;
} {
  const byMonth = new Map<string, BackOfficeNavDailyPositionSheetGasRow>();
  const totalRow = emptyValueGrid();
  const accountTotals = emptyTotals();
  const productTotals = emptyProductTotals();
  let total = 0;

  for (const row of rows) {
    const yyyymm = row.contract_yyyymm;
    const productCode = row.product_code;
    const account = accountKey(row.account_name);
    if (!yyyymm || !productCode || !GAS_PRODUCT_CODES.includes(productCode as (typeof GAS_PRODUCT_CODES)[number]) || !account) {
      continue;
    }

    const quantity = round(row.quantity, 6);
    const gasLots = toOptionalNumber(row.gas_lots);
    const monthRow =
      byMonth.get(yyyymm) ??
      {
        yyyymm,
        monthLabel: formatMonth(yyyymm),
        values: emptyValueGrid(),
        accountTotals: emptyTotals(),
        productTotals: emptyProductTotals(),
        total: 0,
      };

    const accountProductCell = monthRow.values[account][productCode];
    accountProductCell.quantity = round(accountProductCell.quantity + quantity, 6);
    accountProductCell.gasLots = gasLots ?? accountProductCell.gasLots;

    monthRow.accountTotals[account] = round(monthRow.accountTotals[account] + quantity, 6);
    monthRow.accountTotals[ALL_TOTAL_KEY] = round(monthRow.accountTotals[ALL_TOTAL_KEY] + quantity, 6);
    monthRow.productTotals[productCode] = round(monthRow.productTotals[productCode] + quantity, 6);
    monthRow.total = round(monthRow.total + quantity, 6);

    totalRow[account][productCode].quantity = round(totalRow[account][productCode].quantity + quantity, 6);
    totalRow[account][productCode].gasLots = gasLots ?? totalRow[account][productCode].gasLots;
    accountTotals[account] = round(accountTotals[account] + quantity, 6);
    accountTotals[ALL_TOTAL_KEY] = round(accountTotals[ALL_TOTAL_KEY] + quantity, 6);
    productTotals[productCode] = round(productTotals[productCode] + quantity, 6);
    total = round(total + quantity, 6);

    byMonth.set(yyyymm, monthRow);
  }

  return {
    rows: [...byMonth.values()].sort((a, b) => a.yyyymm.localeCompare(b.yyyymm)),
    totalRow,
    accountTotals,
    productTotals,
    total,
  };
}

function optionMonths(rows: OptionPositionRow[]): BackOfficeNavDailyPositionSheetOptionMonth[] {
  const months = new Map<string, BackOfficeNavDailyPositionSheetOptionMonth>();
  for (const row of rows) {
    if (!row.contract_yyyymm) continue;
    const existing = months.get(row.contract_yyyymm) ?? {
      yyyymm: row.contract_yyyymm,
      label: formatMonth(row.contract_yyyymm),
      netQuantity: 0,
      rowCount: 0,
    };
    existing.netQuantity = round(existing.netQuantity + toNumber(row.quantity), 6);
    existing.rowCount += 1;
    months.set(row.contract_yyyymm, existing);
  }
  return [...months.values()].sort((a, b) => a.yyyymm.localeCompare(b.yyyymm));
}

function optionRows(rows: OptionPositionRow[], selectedMonth: string | null): BackOfficeNavDailyPositionSheetOptionRow[] {
  if (!selectedMonth) return [];
  const byStrike = new Map<string, OptionRowAccumulator>();
  for (const row of rows) {
    if (row.contract_yyyymm !== selectedMonth) continue;
    const exchange = row.exchange ?? "UNKNOWN";
    const strike = round(row.strike, 6);
    const key = `${exchange}:${strike}`;
    const topQuantity = toOptionalNumber(row.top_account_quantity);
    const rowTopAccount = topAccountLabel(row.top_account, topQuantity);
    const rowTopMagnitude = Math.abs(topQuantity ?? 0);
    const existing =
      byStrike.get(key) ??
      {
        exchange,
        strike,
        putQuantity: 0,
        callQuantity: 0,
        netQuantity: 0,
        putSettle: null,
        callSettle: null,
        putChange: null,
        callChange: null,
        settlePnl: 0,
        topAccount: rowTopAccount,
        topAccountMagnitude: rowTopMagnitude,
      };
    const quantity = round(row.quantity, 6);
    if (row.put_call === "P") {
      existing.putQuantity = round(existing.putQuantity + quantity, 6);
      existing.putSettle = roundOptional(row.settlement_price, 4);
      existing.putChange = roundOptional(row.daily_change, 4);
    } else if (row.put_call === "C") {
      existing.callQuantity = round(existing.callQuantity + quantity, 6);
      existing.callSettle = roundOptional(row.settlement_price, 4);
      existing.callChange = roundOptional(row.daily_change, 4);
    }
    existing.netQuantity = round(existing.netQuantity + quantity, 6);
    existing.settlePnl = round(existing.settlePnl + toNumber(row.settle_pnl), 0);
    if (rowTopAccount && rowTopMagnitude >= existing.topAccountMagnitude) {
      existing.topAccount = rowTopAccount;
      existing.topAccountMagnitude = rowTopMagnitude;
    }
    byStrike.set(key, existing);
  }
  return [...byStrike.values()]
    .sort((a, b) => a.exchange.localeCompare(b.exchange) || a.strike - b.strike)
    .map((row) => ({
      exchange: row.exchange,
      strike: row.strike,
      putQuantity: row.putQuantity,
      callQuantity: row.callQuantity,
      netQuantity: row.netQuantity,
      putSettle: row.putSettle,
      callSettle: row.callSettle,
      putChange: row.putChange,
      callChange: row.callChange,
      settlePnl: row.settlePnl,
      topAccount: row.topAccount,
    }));
}

function metrics(summary: SummaryRow): BackOfficeNavDailyPositionSheetMetric[] {
  return [
    { label: "Gas active futures", value: formatCount(round(summary.gas_active_future_quantity, 6)), status: "ok" },
    { label: "Missing expiry", value: formatCount(toNumber(summary.missing_expiry_count)), status: toNumber(summary.missing_expiry_count) ? "watch" : "ok" },
    { label: "Unknown accounts", value: formatCount(toNumber(summary.unknown_account_count)), status: toNumber(summary.unknown_account_count) ? "watch" : "ok" },
    { label: "Excluded futures", value: formatCount(toNumber(summary.excluded_future_count)), status: toNumber(summary.excluded_future_count) ? "watch" : "ok" },
    { label: "Excluded options", value: formatCount(toNumber(summary.excluded_option_count)), status: toNumber(summary.excluded_option_count) ? "watch" : "ok" },
    { label: "Unknown option accounts", value: formatCount(toNumber(summary.unknown_option_account_count)), status: toNumber(summary.unknown_option_account_count) ? "watch" : "ok" },
    { label: "Riskmatrix files", value: "unavailable", status: "unavailable" },
  ];
}

export const GET = observedJsonRoute(
  {
    route: "/api/backoffice-nav-daily-position-sheet",
    cacheHeader: CACHE_HEADER,
    cachePolicy: "browser-cache=60, vercel-cdn no-store",
    owner: "frontend",
    purpose: "Back Office NAV Daily Position Sheet gas futures matrix.",
    p95TargetMs: 3_000,
    freshnessSource: "nav.positions promoted frontend mart",
  },
  async (request) => {
    const url = new URL(request.url);
    const requestedDate = parseDateParam(url.searchParams.get("date"));
    const requestedOptionMonth = parseYyyymmParam(url.searchParams.get("optionMonth"));
    const forceRefresh = url.searchParams.has("refresh");
    const cacheTtlSeconds = requestedDate ? HISTORICAL_CACHE_TTL_SECONDS : LATEST_CACHE_TTL_SECONDS;
    const { value, cacheStatus } = await getCachedRouteValue<ObservedRouteResult>({
      namespace: "/api/backoffice-nav-daily-position-sheet",
      key: normalizedSearchCacheKey(url.searchParams),
      ttlMs: cacheTtlSeconds * 1000,
      staleIfErrorMs: STALE_IF_ERROR_MS,
      forceRefresh,
      load: async () => {
    const [availableDates, bundle] = await Promise.all([
      loadAvailableDates(),
      loadMatrixBundle(requestedDate),
    ]);
    const summary = objectRecord(bundle.summary) as unknown as SummaryRow;
    const selectedDate = summary.selected_date ?? requestedDate ?? availableDates[0]?.navDate ?? null;
    const latestDate = availableDates[0]?.navDate ?? selectedDate;
    const gasRows = rowArray<GasFutureRow>(bundle.gas_futures);
    const gasMatrix = gasMatrixRows(gasRows);
    const optionPositionRows = rowArray<OptionPositionRow>(bundle.option_positions);
    const months = optionMonths(optionPositionRows);
    const selectedOptionMonth =
      requestedOptionMonth && months.some((month) => month.yyyymm === requestedOptionMonth)
        ? requestedOptionMonth
        : months[0]?.yyyymm ?? null;
    const selectedOptionRows = optionRows(optionPositionRows, selectedOptionMonth);
    const generatedAt = new Date().toISOString();
    const payload: BackOfficeNavDailyPositionSheetPayload = {
      source: "backoffice-nav-daily-position-sheet",
      generatedAt,
      selectedDate,
      selectedDateLabel: formatDateOnly(selectedDate),
      latestDate,
      latestDateLabel: formatDateOnly(latestDate),
      reportDate: localIsoDate(new Date()),
      reportDateLabel: formatDateOnly(localIsoDate(new Date())),
      navUpdatedAt: summary.nav_updated_at,
      navUpdatedLabel: formatTimestamp(summary.nav_updated_at),
      availableDates,
      metrics: metrics(summary),
      gasFutures: {
        productCodes: [...GAS_PRODUCT_CODES],
        accountColumns: ACCOUNT_COLUMNS,
        rows: gasMatrix.rows,
        totalRow: gasMatrix.totalRow,
        accountTotals: gasMatrix.accountTotals,
        productTotals: gasMatrix.productTotals,
        total: gasMatrix.total,
        rowCount: gasRows.length,
        excludedFutureRows: toNumber(summary.excluded_future_count),
      },
      optionMonths: months,
      optionSummary: {
        activeRows: toNumber(summary.option_active_rows),
        expiredHidden: 0,
        selectedMonth: selectedOptionMonth,
        selectedMonthLabel: selectedOptionMonth ? formatMonth(selectedOptionMonth) : "--",
        selectedMonthRowCount: selectedOptionRows.length,
        putQuantity: round(selectedOptionRows.reduce((total, row) => total + row.putQuantity, 0), 6),
        callQuantity: round(selectedOptionRows.reduce((total, row) => total + row.callQuantity, 0), 6),
        settlePnl: round(selectedOptionRows.reduce((total, row) => total + row.settlePnl, 0), 0),
      },
      optionRows: selectedOptionRows,
      sourceChecks: SOURCE_CHECKS,
    };

    return {
      payload,
      rowCount: toNumber(summary.row_count),
      dataAsOf: summary.nav_updated_at ?? generatedAt,
    };
      },
    });

    return {
      ...value,
      headers: {
        ...responseHeaders(forceRefresh, cacheTtlSeconds),
        ...routeCacheHeaders(cacheStatus),
      },
    };
  },
);
