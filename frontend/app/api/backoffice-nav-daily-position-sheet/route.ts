import {
  measureRoutePhase,
  observedJsonRoute,
  type ObservedRouteResult,
} from "@/lib/server/apiObservability";
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
  BackOfficeNavDailyPositionSheetOptionDetailPayload,
  BackOfficeNavDailyPositionSheetOptionRow,
  BackOfficeNavDailyPositionSheetOptionSummary,
  BackOfficeNavDailyPositionSheetPayload,
  BackOfficeNavDailyPositionSheetPowerCell,
  BackOfficeNavDailyPositionSheetPowerFuturesSection,
  BackOfficeNavDailyPositionSheetPowerFutureRow,
} from "@/lib/positionsAndTrades/backOfficeNavDailyPositionSheetTypes";

export const runtime = "nodejs";
export const maxDuration = 30;

const LATEST_CACHE_TTL_SECONDS = 5 * 60;
const HISTORICAL_CACHE_TTL_SECONDS = 60 * 60;
const STALE_IF_ERROR_MS = 30 * 60 * 1000;
const CACHE_HEADER = `private, max-age=${LATEST_CACHE_TTL_SECONDS}, stale-while-revalidate=${LATEST_CACHE_TTL_SECONDS}`;
const NO_STORE_HEADER = "no-store";
const DISPLAY_TIME_ZONE = "America/New_York";
const SOURCE_CHECKS =
  "Sources: NAV Positions Frontend Contract; gas quantity and gas lots are derived upstream in dbt.";
const GAS_PRODUCT_CODES = ["PHH", "NG", "HP", "HH", "H"] as const;
const OPTION_DAILY_CHANGE_LOOKBACK_DAYS = 45;
const ALL_TOTAL_KEY = "ALL";
type PositionView = "gas" | "power";
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
  metadata: unknown;
  gas_futures: unknown;
  power_futures: unknown;
  power_option_months: unknown;
  power_option_positions: unknown;
  option_months: unknown;
  option_positions: unknown;
}

interface SummaryRow {
  selected_date: string | null;
  nav_updated_at: string | null;
  row_count: number | string | null;
  gas_active_future_quantity: number | string | null;
  power_active_future_quantity: number | string | null;
  missing_expiry_count: number | string | null;
  unknown_account_count: number | string | null;
  excluded_future_count: number | string | null;
  excluded_option_count: number | string | null;
  unknown_option_account_count: number | string | null;
  option_active_rows: number | string | null;
  power_option_active_rows: number | string | null;
}

interface GasFutureRow {
  contract_yyyymm: string | null;
  account_name: string | null;
  product_code: string | null;
  quantity: number | string | null;
  gas_lots: number | string | null;
}

interface PowerFutureRow {
  contract_yyyymm: string | null;
  contract_day: number | string | null;
  product_region: string | null;
  account_name: string | null;
  product_code: string | null;
  product_label: string | null;
  quantity: number | string | null;
  multiplier: number | string | null;
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
  qty_acim: number | string | null;
  qty_pnt: number | string | null;
  qty_dickson: number | string | null;
  qty_titan: number | string | null;
}

interface OptionMonthAggregateRow {
  contract_yyyymm: string | null;
  quantity: number | string | null;
  row_count: number | string | null;
}

interface ParsedTextListFilter {
  displayValues: string[];
  sqlValues: string[];
}

interface MetadataDbRow {
  product_regions: unknown;
}

type OptionRowAccumulator = BackOfficeNavDailyPositionSheetOptionRow & {
  accountQuantities: Record<string, number>;
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

function parsePositionViewParam(value: string | null): PositionView {
  return value === "power" ? "power" : "gas";
}

function parseBooleanParam(value: string | null, fallback = false): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function parseFilterText(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "all") return null;
  return normalized.slice(0, maxLength);
}

function parseTextListFilter(
  searchParams: URLSearchParams,
  name: string,
  maxLength: number,
): ParsedTextListFilter {
  const seen = new Set<string>();
  const displayValues: string[] = [];
  const sqlValues: string[] = [];

  for (const rawValue of searchParams.getAll(name)) {
    for (const part of rawValue.split(",")) {
      const parsed = parseFilterText(part, maxLength);
      if (!parsed) continue;
      const sqlValue = parsed.toLowerCase();
      if (seen.has(sqlValue)) continue;
      seen.add(sqlValue);
      displayValues.push(parsed);
      sqlValues.push(sqlValue);
    }
  }

  return {
    displayValues: displayValues.slice(0, 40),
    sqlValues: sqlValues.slice(0, 40),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
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

function formatMonthLong(yyyymm: string): string {
  const year = Number.parseInt(yyyymm.slice(0, 4), 10);
  const month = Number.parseInt(yyyymm.slice(4, 6), 10);
  if (!year || !month) return yyyymm;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    year: "numeric",
  });
}

function contractKey(yyyymm: string, contractDay: unknown): string {
  const day = toOptionalNumber(contractDay);
  return day == null ? yyyymm : `${yyyymm}${String(Math.trunc(day)).padStart(2, "0")}`;
}

function contractLabel(yyyymm: string, contractDay: unknown): string {
  const day = toOptionalNumber(contractDay);
  if (day == null) return yyyymm;
  const year = Number.parseInt(yyyymm.slice(0, 4), 10);
  const month = Number.parseInt(yyyymm.slice(4, 6), 10);
  if (!year || !month) return contractKey(yyyymm, day);
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.trunc(day)).padStart(2, "0")}`;
}

function powerRegionLabel(region: string | null): string {
  const normalized = region?.trim().toUpperCase() ?? "";
  if (normalized === "PJM") return "PJM";
  if (normalized === "ERCOT") return "ERCOT";
  if (normalized === "MID-C" || normalized === "CAISO" || normalized === "WEST") return "WEST";
  return normalized || "OTHER";
}

function powerRegionSort(label: string): number {
  if (label === "PJM") return 0;
  if (label === "ERCOT") return 1;
  if (label === "WEST") return 2;
  return 9;
}

function powerProductLabel(productCode: string, fallback: string | null): string {
  if (productCode === "PMI") return "PJM WH RT PEAK";
  if (productCode === "PDA") return "PJM WH DA PEAK";
  if (productCode === "ERN") return "ERCOT NORTH RT PEAK";
  if (productCode === "MDC") return "MID-C PEAK";
  if (productCode === "SPM") return "SP15 PEAK";
  const cleaned = fallback?.replace(/\s+/g, " ").trim();
  return cleaned || productCode;
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

function emptyPowerCell(): BackOfficeNavDailyPositionSheetPowerCell {
  return { quantity: 0, rawQuantity: 0, multiplier: null };
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

async function loadOptionPositionsForDailyChange(
  selectedDate: string | null,
  selectedMonth: string | null,
  optionKind: PositionView,
  productRegionFilter: ParsedTextListFilter,
): Promise<OptionPositionRow[]> {
  if (!selectedMonth) return [];

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
        product_group,
        product_code,
        product_norm,
        underlying_product_code,
        contract_yyyymm,
        put_call,
        normalized_strike_price,
        quantity_1,
        gas_qty,
        gas_lots,
        multiplier_and_tick_value,
        trade_price,
        market_settlement_price
      FROM modelled_nav_positions
      CROSS JOIN params
      WHERE (params.selected_nav_date IS NULL OR nav_date <= params.selected_nav_date)
        AND (
          params.selected_nav_date IS NULL
          OR nav_date >= params.selected_nav_date - ($3::integer * INTERVAL '1 day')
        )
        AND put_call IS NOT NULL
        AND contract_yyyymm IS NOT NULL
        AND contract_yyyymm = $2::text
        AND normalized_strike_price IS NOT NULL
        AND (
          ($4::text = 'gas' AND product_code IN ('LN', 'PHE'))
          OR ($4::text = 'power' AND product_group = 'Power')
        )
        AND (
          $4::text <> 'power'
          OR cardinality($5::text[]) = 0
          OR lower(coalesce(product_region, '')) = ANY($5::text[])
        )
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
          case
            when $4::text = 'power'
            then coalesce(product_code, underlying_product_code, product_norm, '<null>')
            else coalesce(product_code, underlying_product_code, '<null>')
          end,
          coalesce(put_call, '<null>'),
          coalesce(normalized_strike_price::text, '<null>'),
          coalesce(contract_yyyymm, '<null>'),
          coalesce(
            case
              when $4::text = 'power' then multiplier_and_tick_value
              else gas_lots
            end::text,
            '<null>'
          )
        )) AS position_group_key,
        nav_date,
        case
          when $4::text = 'power'
          then coalesce(product_code, underlying_product_code, product_norm, 'UNKNOWN')
          else coalesce(product_code, underlying_product_code, 'UNKNOWN')
        end AS exchange,
        put_call,
        normalized_strike_price::double precision AS strike,
        contract_yyyymm,
        case
          when $4::text = 'power' then multiplier_and_tick_value
          else gas_lots
        end::double precision AS lots,
        avg(market_settlement_price)::double precision AS settlement_price_total,
        avg(trade_price)::double precision AS trade_price_total,
        sum(coalesce(case when $4::text = 'power' then quantity_1 else gas_qty end, 0))::double precision AS qty_total,
        sum(case when account_name = 'ACIM' then coalesce(case when $4::text = 'power' then quantity_1 else gas_qty end, 0) else 0 end)::double precision AS qty_acim,
        sum(case when account_name = 'PNT' then coalesce(case when $4::text = 'power' then quantity_1 else gas_qty end, 0) else 0 end)::double precision AS qty_pnt,
        sum(case when account_name = 'DICKSON' then coalesce(case when $4::text = 'power' then quantity_1 else gas_qty end, 0) else 0 end)::double precision AS qty_dickson,
        sum(case when account_name = 'TITAN' then coalesce(case when $4::text = 'power' then quantity_1 else gas_qty end, 0) else 0 end)::double precision AS qty_titan
      FROM position_rows
      GROUP BY
        nav_date,
        case
          when $4::text = 'power'
          then coalesce(product_code, underlying_product_code, product_norm, 'UNKNOWN')
          else coalesce(product_code, underlying_product_code, 'UNKNOWN')
        end,
        product_code,
        product_norm,
        underlying_product_code,
        put_call,
        normalized_strike_price,
        contract_yyyymm,
        case
          when $4::text = 'power' then multiplier_and_tick_value
          else gas_lots
        end
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
        case
          when $4::text = 'power' and with_previous.lots IS NOT NULL
          then concat(
            with_previous.exchange,
            '_',
            trim(trailing '.' from trim(trailing '0' from round(with_previous.lots::numeric, 6)::text))
          )
          else with_previous.exchange
        end AS exchange,
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
            * coalesce(with_previous.lots, 1)
          when with_previous.previous_nav_date IS NULL and with_previous.trade_price_total IS NOT NULL
          then (with_previous.settlement_price_total - with_previous.trade_price_total)
            * with_previous.qty_total
            * coalesce(with_previous.lots, 1)
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
        ranked_accounts.account_quantity AS top_account_quantity,
        selected_option_rows.qty_acim,
        selected_option_rows.qty_pnt,
        selected_option_rows.qty_dickson,
        selected_option_rows.qty_titan
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
    [selectedDate, selectedMonth, OPTION_DAILY_CHANGE_LOOKBACK_DAYS, optionKind, productRegionFilter.sqlValues],
  );
}

async function loadMatrixBundle(
  requestedDate: string | null,
  requestedOptionMonth: string | null,
  optionDetailKind: PositionView,
  productRegionFilter: ParsedTextListFilter,
  includeOptionDetail: boolean,
): Promise<MatrixBundleDbRow> {
  const promotedArtifact = await loadPromotedNavPositionsSql({ requestedDate });
  const selectedPositionsSql = selectedNavPositionsCte(promotedArtifact.sql, {
    latestAlreadySelected: requestedDate === null,
  });
  const productGroupFilters = optionDetailKind === "power" ? ["power"] : ["gas", "basis"];
  const productRegionFilters = optionDetailKind === "power" ? productRegionFilter.sqlValues : [];
  const args = [
    requestedDate,
    null,
    null,
    null,
    productGroupFilters,
    productRegionFilters,
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
            sum(coalesce(quantity_1, 0)) FILTER (
              WHERE put_call IS NULL
                AND contract_yyyymm IS NOT NULL
                AND product_group = 'Power'
                AND contract_day IS NULL
            )::double precision AS power_active_future_quantity,
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
                AND NOT (
                  coalesce(product_code, '') IN ('LN', 'PHE')
                  OR product_group = 'Power'
                )
            )::integer AS excluded_option_count,
            count(*) FILTER (
              WHERE put_call IS NOT NULL
                AND coalesce(account_lookup_status, '') <> 'matched'
            )::integer AS unknown_option_account_count,
            count(DISTINCT concat_ws(
              '||',
              coalesce(product_code, underlying_product_code, 'UNKNOWN'),
              contract_yyyymm,
              normalized_strike_price::text
            )) FILTER (
              WHERE put_call IS NOT NULL
                AND coalesce(product_code, '') IN ('LN', 'PHE')
                AND contract_yyyymm IS NOT NULL
                AND normalized_strike_price IS NOT NULL
            )::integer AS option_active_rows,
            count(DISTINCT concat_ws(
              '||',
              coalesce(product_code, underlying_product_code, product_norm, 'UNKNOWN'),
              coalesce(multiplier_and_tick_value::text, '<null>'),
              contract_yyyymm,
              normalized_strike_price::text
            )) FILTER (
              WHERE put_call IS NOT NULL
                AND product_group = 'Power'
                AND contract_yyyymm IS NOT NULL
                AND normalized_strike_price IS NOT NULL
            )::integer AS power_option_active_rows
          FROM selected_positions
        ) summary_row
      ) AS summary,
      (
        SELECT jsonb_build_object(
          'product_regions',
          (
            SELECT coalesce(jsonb_agg(product_region ORDER BY product_region), '[]'::jsonb)
            FROM (
              SELECT DISTINCT product_region
              FROM filter_source_positions
              WHERE product_group = 'Power'
                AND product_region IS NOT NULL
                AND product_region <> ''
            ) product_regions
          )
        )
      ) AS metadata,
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
      (
        SELECT coalesce(jsonb_agg(to_jsonb(power_row) ORDER BY
          contract_yyyymm,
          contract_day NULLS FIRST,
          account_name,
          product_code
        ), '[]'::jsonb)
        FROM (
          SELECT
            contract_yyyymm,
            contract_day,
            product_region,
            account_name,
            product_code,
            coalesce(product_norm, product, product_code) AS product_label,
            sum(coalesce(quantity_1, 0))::double precision AS quantity,
            max(multiplier_and_tick_value)::double precision AS multiplier
          FROM selected_positions
          WHERE put_call IS NULL
            AND contract_yyyymm IS NOT NULL
            AND product_group = 'Power'
            AND NULLIF(product_code, '') IS NOT NULL
          GROUP BY
            contract_yyyymm,
            contract_day,
            product_region,
            account_name,
            product_code,
            coalesce(product_norm, product, product_code)
        ) power_row
      ) AS power_futures,
      (
        SELECT coalesce(jsonb_agg(to_jsonb(option_month_row) ORDER BY contract_yyyymm), '[]'::jsonb)
        FROM (
          SELECT
            contract_yyyymm,
            sum(coalesce(gas_qty, 0))::double precision AS quantity,
            count(DISTINCT concat_ws(
              '||',
              coalesce(product_code, underlying_product_code, 'UNKNOWN'),
              normalized_strike_price::text
            ))::integer AS row_count
          FROM selected_positions
          WHERE put_call IS NOT NULL
            AND contract_yyyymm IS NOT NULL
            AND product_code IN ('LN', 'PHE')
            AND normalized_strike_price IS NOT NULL
          GROUP BY contract_yyyymm
        ) option_month_row
      ) AS option_months,
      (
        SELECT coalesce(jsonb_agg(to_jsonb(power_option_month_row) ORDER BY contract_yyyymm), '[]'::jsonb)
        FROM (
          SELECT
            contract_yyyymm,
            sum(coalesce(quantity_1, 0))::double precision AS quantity,
            count(DISTINCT concat_ws(
              '||',
              coalesce(product_code, underlying_product_code, product_norm, 'UNKNOWN'),
              coalesce(multiplier_and_tick_value::text, '<null>'),
              normalized_strike_price::text
            ))::integer AS row_count
          FROM selected_positions
          WHERE put_call IS NOT NULL
            AND contract_yyyymm IS NOT NULL
            AND product_group = 'Power'
            AND normalized_strike_price IS NOT NULL
          GROUP BY contract_yyyymm
        ) power_option_month_row
      ) AS power_option_months,
      '[]'::jsonb AS option_positions,
      '[]'::jsonb AS power_option_positions
    `,
    args,
  );
  const bundle = rows[0] ?? {
    summary: {},
    metadata: {},
    gas_futures: [],
    power_futures: [],
    power_option_months: [],
    power_option_positions: [],
    option_months: [],
    option_positions: [],
  };
  const summary = objectRecord(bundle.summary) as unknown as SummaryRow;
  const monthRows = rowArray<OptionMonthAggregateRow>(bundle.option_months);
  const months = optionMonths(monthRows);
  const powerMonths = optionMonths(rowArray<OptionMonthAggregateRow>(bundle.power_option_months));
  const selectedOptionMonth =
    requestedOptionMonth && months.some((month) => month.yyyymm === requestedOptionMonth)
      ? requestedOptionMonth
      : months[0]?.yyyymm ?? null;
  const selectedPowerOptionMonth =
    requestedOptionMonth && powerMonths.some((month) => month.yyyymm === requestedOptionMonth)
      ? requestedOptionMonth
      : powerMonths[0]?.yyyymm ?? null;
  const optionPositions = includeOptionDetail && optionDetailKind === "gas"
    ? await measureRoutePhase("option-daily-change", () =>
        loadOptionPositionsForDailyChange(summary.selected_date ?? requestedDate, selectedOptionMonth, "gas", {
          displayValues: [],
          sqlValues: [],
        }),
      )
    : [];
  const powerOptionPositions = includeOptionDetail && optionDetailKind === "power"
    ? await measureRoutePhase("power-option-daily-change", () =>
        loadOptionPositionsForDailyChange(
          summary.selected_date ?? requestedDate,
          selectedPowerOptionMonth,
          "power",
          productRegionFilter,
        ),
      )
    : [];
  return {
    ...bundle,
    option_positions: optionPositions,
    power_option_positions: powerOptionPositions,
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

function emptyPowerSection(unitLabel: string): BackOfficeNavDailyPositionSheetPowerFuturesSection {
  return {
    columns: [],
    rows: [],
    totals: {},
    total: 0,
    productCount: 0,
    dateCount: 0,
    unitLabel,
  };
}

function powerSectionRows(
  rows: PowerFutureRow[],
  section: "monthly" | "daily",
): BackOfficeNavDailyPositionSheetPowerFuturesSection {
  const sourceRows = rows.filter((row) =>
    section === "monthly" ? row.contract_day == null : row.contract_day != null,
  );
  const unitLabel = section === "monthly" ? "raw lots" : "net qty";
  if (sourceRows.length === 0) return emptyPowerSection(unitLabel);

  const columnKeys = [...new Set(sourceRows.map((row) => {
    if (!row.contract_yyyymm) return null;
    return section === "monthly" ? row.contract_yyyymm : contractKey(row.contract_yyyymm, row.contract_day);
  }).filter((key): key is string => Boolean(key)))]
    .sort((a, b) => a.localeCompare(b));
  const columns = columnKeys.map((key) => ({
    key,
    label: section === "monthly" ? formatMonthLong(key) : contractLabel(key.slice(0, 6), key.slice(6, 8)),
    subLabel: key,
  }));
  const byProduct = new Map<string, BackOfficeNavDailyPositionSheetPowerFutureRow>();
  const totals: Record<string, number> = Object.fromEntries(columnKeys.map((key) => [key, 0]));
  let grandTotal = 0;

  for (const row of sourceRows) {
    const yyyymm = row.contract_yyyymm;
    const productCode = row.product_code;
    if (!yyyymm || !productCode) continue;

    const columnKey = section === "monthly" ? yyyymm : contractKey(yyyymm, row.contract_day);
    const rawQuantity = round(row.quantity, 6);
    const multiplier = toOptionalNumber(row.multiplier);
    const quantity = rawQuantity;
    const regionLabel = powerRegionLabel(row.product_region);
    const productKey = `${regionLabel}:${productCode}`;
    const productRow =
      byProduct.get(productKey) ??
      {
        productCode,
        productLabel: powerProductLabel(productCode, row.product_label),
        productRegion: row.product_region ?? regionLabel,
        regionLabel,
        unitLabel,
        values: {},
        total: 0,
      };
    const existing = productRow.values[columnKey] ?? emptyPowerCell();
    productRow.values[columnKey] = {
      quantity: round(existing.quantity + quantity, 6),
      rawQuantity: round(existing.rawQuantity + rawQuantity, 6),
      multiplier: multiplier ?? existing.multiplier,
    };
    productRow.total = round(productRow.total + quantity, 6);
    totals[columnKey] = round((totals[columnKey] ?? 0) + quantity, 6);
    grandTotal = round(grandTotal + quantity, 6);
    byProduct.set(productKey, productRow);
  }

  const sortedRows = [...byProduct.values()].sort((left, right) => {
    const regionCompare = powerRegionSort(left.regionLabel) - powerRegionSort(right.regionLabel);
    if (regionCompare !== 0) return regionCompare;
    return left.productLabel.localeCompare(right.productLabel, undefined, { numeric: true });
  });

  return {
    columns,
    rows: sortedRows,
    totals,
    total: grandTotal,
    productCount: sortedRows.length,
    dateCount: columns.length,
    unitLabel,
  };
}

function powerFuturesSections(rows: PowerFutureRow[]): {
  monthly: BackOfficeNavDailyPositionSheetPowerFuturesSection;
  daily: BackOfficeNavDailyPositionSheetPowerFuturesSection;
} {
  return {
    monthly: powerSectionRows(rows, "monthly"),
    daily: powerSectionRows(rows, "daily"),
  };
}

function optionMonths(rows: OptionMonthAggregateRow[]): BackOfficeNavDailyPositionSheetOptionMonth[] {
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
    existing.rowCount += toNumber(row.row_count);
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
        accounts: [],
        accountQuantities: Object.fromEntries(ACCOUNT_COLUMNS.map((account) => [account.key, 0])),
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
    existing.accountQuantities.ACIM = round(existing.accountQuantities.ACIM + toNumber(row.qty_acim), 6);
    existing.accountQuantities.PNT = round(existing.accountQuantities.PNT + toNumber(row.qty_pnt), 6);
    existing.accountQuantities.DICKSON = round(existing.accountQuantities.DICKSON + toNumber(row.qty_dickson), 6);
    existing.accountQuantities.TITAN = round(existing.accountQuantities.TITAN + toNumber(row.qty_titan), 6);
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
      accounts: ACCOUNT_COLUMNS.map((account) => ({
        account: account.key,
        quantity: row.accountQuantities[account.key] ?? 0,
      })).filter((account) => account.quantity !== 0),
    }));
}

function summarizeOptionDetail(
  rows: BackOfficeNavDailyPositionSheetOptionRow[],
  selectedMonth: string | null,
  activeRows: number,
): BackOfficeNavDailyPositionSheetOptionSummary {
  return {
    activeRows,
    expiredHidden: 0,
    selectedMonth,
    selectedMonthLabel: selectedMonth ? formatMonth(selectedMonth) : "--",
    selectedMonthRowCount: rows.length,
    putQuantity: round(
      rows.reduce((total, row) => total + row.putQuantity, 0),
      6,
    ),
    callQuantity: round(
      rows.reduce((total, row) => total + row.callQuantity, 0),
      6,
    ),
    settlePnl: round(
      rows.reduce((total, row) => total + row.settlePnl, 0),
      0,
    ),
    detailLoaded: true,
  };
}

async function loadOptionDetailPayload({
  requestedDate,
  requestedOptionMonth,
  optionDetailKind,
  productRegionFilter,
}: {
  requestedDate: string | null;
  requestedOptionMonth: string | null;
  optionDetailKind: PositionView;
  productRegionFilter: ParsedTextListFilter;
}): Promise<{
  payload: BackOfficeNavDailyPositionSheetOptionDetailPayload;
  rowCount: number;
  dataAsOf: string | null;
}> {
  const optionPositions = requestedOptionMonth
    ? await measureRoutePhase(`${optionDetailKind}-option-detail`, () =>
        loadOptionPositionsForDailyChange(
          requestedDate,
          requestedOptionMonth,
          optionDetailKind,
          productRegionFilter,
        ),
      )
    : [];
  const rows = optionRows(optionPositions, requestedOptionMonth);
  const generatedAt = new Date().toISOString();
  const payload: BackOfficeNavDailyPositionSheetOptionDetailPayload = {
    source: "backoffice-nav-daily-position-sheet-option-detail",
    generatedAt,
    selectedDate: requestedDate,
    positionView: optionDetailKind,
    selectedMonth: requestedOptionMonth,
    selectedMonthLabel: requestedOptionMonth ? formatMonth(requestedOptionMonth) : "--",
    summary: summarizeOptionDetail(rows, requestedOptionMonth, rows.length),
    rows,
  };

  return {
    payload,
    rowCount: rows.length,
    dataAsOf: generatedAt,
  };
}

function metrics(summary: SummaryRow): BackOfficeNavDailyPositionSheetMetric[] {
  return [
    { label: "Gas active futures", value: formatCount(round(summary.gas_active_future_quantity, 6)), status: "ok" },
    { label: "Power active futures", value: formatCount(round(summary.power_active_future_quantity, 6)), status: "ok" },
    { label: "Missing expiry", value: formatCount(toNumber(summary.missing_expiry_count)), status: toNumber(summary.missing_expiry_count) ? "watch" : "ok" },
    { label: "Unknown accounts", value: formatCount(toNumber(summary.unknown_account_count)), status: toNumber(summary.unknown_account_count) ? "watch" : "ok" },
    { label: "Excluded futures", value: formatCount(toNumber(summary.excluded_future_count)), status: toNumber(summary.excluded_future_count) ? "watch" : "ok" },
    { label: "Excluded options", value: formatCount(toNumber(summary.excluded_option_count)), status: toNumber(summary.excluded_option_count) ? "watch" : "ok" },
    { label: "Unknown option accounts", value: formatCount(toNumber(summary.unknown_option_account_count)), status: toNumber(summary.unknown_option_account_count) ? "watch" : "ok" },
    { label: "Riskmatrix files", value: "4/4", status: "ok" },
  ];
}

export const GET = observedJsonRoute(
  {
    route: "/api/backoffice-nav-daily-position-sheet",
    cacheHeader: CACHE_HEADER,
    cachePolicy: "browser-cache=300, vercel-cdn no-store",
    owner: "frontend",
    purpose: "Back Office NAV Daily Position Sheet gas and power position matrix.",
    p95TargetMs: 3_000,
    freshnessSource: "nav.positions promoted frontend mart",
  },
  async (request) => {
    const url = new URL(request.url);
    const requestedDate = parseDateParam(url.searchParams.get("date"));
    const requestedOptionMonth = parseYyyymmParam(url.searchParams.get("optionMonth"));
    const requestedPositionView = parsePositionViewParam(url.searchParams.get("positionView"));
    const includeOptionDetail = parseBooleanParam(url.searchParams.get("optionDetail"), false);
    const productRegionFilter = parseTextListFilter(url.searchParams, "productRegion", 80);
    const forceRefresh = url.searchParams.has("refresh");
    const cacheTtlSeconds = requestedDate ? HISTORICAL_CACHE_TTL_SECONDS : LATEST_CACHE_TTL_SECONDS;

    if (url.searchParams.get("detail") === "option") {
      const { value, cacheStatus } = await getCachedRouteValue<ObservedRouteResult>({
        namespace: "/api/backoffice-nav-daily-position-sheet/option-detail",
        key: normalizedSearchCacheKey(url.searchParams),
        ttlMs: cacheTtlSeconds * 1000,
        staleIfErrorMs: STALE_IF_ERROR_MS,
        forceRefresh,
        dataCache: true,
        dataCacheTtlSeconds: cacheTtlSeconds,
        load: () =>
          loadOptionDetailPayload({
            requestedDate,
            requestedOptionMonth,
            optionDetailKind: requestedPositionView,
            productRegionFilter,
          }),
      });

      return {
        ...value,
        headers: {
          ...responseHeaders(forceRefresh, cacheTtlSeconds),
          ...routeCacheHeaders(cacheStatus),
        },
      };
    }

    const { value, cacheStatus } = await getCachedRouteValue<ObservedRouteResult>({
      namespace: "/api/backoffice-nav-daily-position-sheet",
      key: normalizedSearchCacheKey(url.searchParams),
      ttlMs: cacheTtlSeconds * 1000,
      staleIfErrorMs: STALE_IF_ERROR_MS,
      forceRefresh,
      dataCache: true,
      dataCacheTtlSeconds: cacheTtlSeconds,
      load: async () => {
        const [availableDates, bundle] = await Promise.all([
          measureRoutePhase("available-dates", loadAvailableDates),
          measureRoutePhase("matrix-bundle", () =>
            loadMatrixBundle(
              requestedDate,
              requestedOptionMonth,
              requestedPositionView,
              productRegionFilter,
              includeOptionDetail,
            ),
          ),
        ]);
        const summary = objectRecord(bundle.summary) as unknown as SummaryRow;
        const metadata = objectRecord(bundle.metadata) as unknown as MetadataDbRow;
        const selectedDate = summary.selected_date ?? requestedDate ?? availableDates[0]?.navDate ?? null;
        const latestDate = availableDates[0]?.navDate ?? selectedDate;
        const gasRows = rowArray<GasFutureRow>(bundle.gas_futures);
        const gasMatrix = gasMatrixRows(gasRows);
        const powerRows = rowArray<PowerFutureRow>(bundle.power_futures);
        const powerSections = powerFuturesSections(powerRows);
        const optionPositionRows = rowArray<OptionPositionRow>(bundle.option_positions);
        const months = optionMonths(rowArray<OptionMonthAggregateRow>(bundle.option_months));
        const powerOptionPositionRows = rowArray<OptionPositionRow>(bundle.power_option_positions);
        const powerMonths = optionMonths(rowArray<OptionMonthAggregateRow>(bundle.power_option_months));
        const selectedOptionMonth =
          requestedOptionMonth && months.some((month) => month.yyyymm === requestedOptionMonth)
            ? requestedOptionMonth
            : months[0]?.yyyymm ?? null;
        const selectedPowerOptionMonth =
          requestedOptionMonth && powerMonths.some((month) => month.yyyymm === requestedOptionMonth)
            ? requestedOptionMonth
            : powerMonths[0]?.yyyymm ?? null;
        const selectedOptionRows = optionRows(optionPositionRows, selectedOptionMonth);
        const selectedPowerOptionRows = optionRows(powerOptionPositionRows, selectedPowerOptionMonth);
        const selectedOptionMonthRowCount =
          months.find((month) => month.yyyymm === selectedOptionMonth)?.rowCount ?? selectedOptionRows.length;
        const selectedPowerOptionMonthRowCount =
          powerMonths.find((month) => month.yyyymm === selectedPowerOptionMonth)?.rowCount ??
          selectedPowerOptionRows.length;
        const generatedAt = new Date().toISOString();
        const reportDate = localIsoDate(new Date());
        const payload: BackOfficeNavDailyPositionSheetPayload = {
          source: "backoffice-nav-daily-position-sheet",
          generatedAt,
          selectedDate,
          selectedDateLabel: formatDateOnly(selectedDate),
          latestDate,
          latestDateLabel: formatDateOnly(latestDate),
          reportDate,
          reportDateLabel: formatDateOnly(reportDate),
          navUpdatedAt: summary.nav_updated_at,
          navUpdatedLabel: formatTimestamp(summary.nav_updated_at),
          availableDates,
          filters: {
            productRegions: requestedPositionView === "power" ? productRegionFilter.displayValues : [],
          },
          metadata: {
            productRegions: stringArray(metadata.product_regions),
          },
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
          powerFutures: {
            monthly: powerSections.monthly,
            daily: powerSections.daily,
            rowCount: powerRows.length,
          },
          optionMonths: months,
          optionSummary: {
            activeRows: toNumber(summary.option_active_rows),
            expiredHidden: 0,
            selectedMonth: selectedOptionMonth,
            selectedMonthLabel: selectedOptionMonth ? formatMonth(selectedOptionMonth) : "--",
            selectedMonthRowCount: includeOptionDetail ? selectedOptionRows.length : selectedOptionMonthRowCount,
            putQuantity: round(
              selectedOptionRows.reduce((total, row) => total + row.putQuantity, 0),
              6,
            ),
            callQuantity: round(
              selectedOptionRows.reduce((total, row) => total + row.callQuantity, 0),
              6,
            ),
            settlePnl: round(
              selectedOptionRows.reduce((total, row) => total + row.settlePnl, 0),
              0,
            ),
            detailLoaded: includeOptionDetail,
          },
          optionRows: selectedOptionRows,
          powerOptionMonths: powerMonths,
          powerOptionSummary: {
            activeRows: toNumber(summary.power_option_active_rows),
            expiredHidden: 0,
            selectedMonth: selectedPowerOptionMonth,
            selectedMonthLabel: selectedPowerOptionMonth ? formatMonth(selectedPowerOptionMonth) : "--",
            selectedMonthRowCount: includeOptionDetail
              ? selectedPowerOptionRows.length
              : selectedPowerOptionMonthRowCount,
            putQuantity: round(
              selectedPowerOptionRows.reduce((total, row) => total + row.putQuantity, 0),
              6,
            ),
            callQuantity: round(
              selectedPowerOptionRows.reduce((total, row) => total + row.callQuantity, 0),
              6,
            ),
            settlePnl: round(
              selectedPowerOptionRows.reduce((total, row) => total + row.settlePnl, 0),
              0,
            ),
            detailLoaded: includeOptionDetail,
          },
          powerOptionRows: selectedPowerOptionRows,
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
