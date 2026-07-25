import { observedJsonRoute, type ObservedRouteResult } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import {
  getCachedRouteValue,
  normalizedSearchCacheKey,
  routeCacheHeaders,
} from "@/lib/server/routeCache";
import type {
  BackOfficePositionsTradesAvailableDate,
  BackOfficePositionsTradesColumn,
  BackOfficePositionsTradesCommodity,
  BackOfficePositionsTradesInstrument,
  BackOfficePositionsTradesMark,
  BackOfficePositionsTradesPayload,
  BackOfficePositionsTradesRow,
} from "@/lib/positionsAndTrades/backOfficePositionsTradesTypes";

export const runtime = "nodejs";
export const maxDuration = 30;

const LATEST_CACHE_TTL_SECONDS = 2 * 60;
const HISTORICAL_CACHE_TTL_SECONDS = 60 * 60;
const STALE_IF_ERROR_MS = 30 * 60 * 1000;
const CACHE_HEADER = `private, max-age=${LATEST_CACHE_TTL_SECONDS}, stale-while-revalidate=${LATEST_CACHE_TTL_SECONDS}`;
const NO_STORE_HEADER = "no-store";
const DISPLAY_TIME_ZONE = "America/New_York";
const MAX_COLUMNS = 44;
const MAX_ROWS = 120;

interface DateRow {
  nav_date: string;
  row_count: number | string;
  latest_upload_at: string | null;
}

interface AccountRow {
  account: string | null;
}

interface PositionRow {
  product: string | null;
  product_id_internal: string | null;
  type: string | null;
  month_year: string | null;
  quantity_1: number | string | null;
  market_value_in_base_currency: number | string | null;
  exchange_name: string | null;
}

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

function parseCommodity(value: string | null): BackOfficePositionsTradesCommodity {
  return value === "natural_gas" || value === "power" ? value : "both";
}

function parseInstrument(value: string | null): BackOfficePositionsTradesInstrument {
  return value === "fixed_price" || value === "options" ? value : "both";
}

function parseMark(value: string | null): BackOfficePositionsTradesMark {
  return value === "settlement" ? "settlement" : "live";
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function liveLabel(now: Date, count: number): string {
  return `Live (${count}) | ${now.toLocaleTimeString("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  })}`;
}

function displayProductName(row: PositionRow): string {
  const raw = cleanText(row.product) ?? cleanText(row.product_id_internal) ?? "Unmapped Product";
  const upper = raw.toUpperCase();
  if (upper.includes("ALGONQUIN") && upper.includes("BASIS")) return "Algonquin Citygate Basis";
  if (upper.includes("CIG") && upper.includes("ROCKIES")) return "CIG Rockies Basis";
  if (upper.includes("HENRY HUB") && upper.includes("NYMEX")) return "Henry Hub";
  if (upper.includes("NATURAL GAS") && (row.exchange_name ?? "").toUpperCase().includes("NYM")) {
    return "Henry Hub Penultimate (CME)";
  }
  if (upper === "NATURAL GAS" || upper.includes("HENRY")) return "Henry Hub Penultimate (ICE)";
  return raw
    .replace(/^ICE\s+/i, "")
    .replace(/^NYMEX\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function commodityFor(row: PositionRow): "Natural Gas" | "Power" {
  const text = `${row.product ?? ""} ${row.product_id_internal ?? ""} ${row.exchange_name ?? ""}`.toUpperCase();
  if (
    text.includes("NATURAL GAS") ||
    text.includes("HENRY") ||
    text.includes("ALGONQUIN") ||
    text.includes("CIG") ||
    text.includes("TETCO") ||
    text.includes("TRANSCO")
  ) {
    return "Natural Gas";
  }
  return "Power";
}

function instrumentFor(row: PositionRow): "Fixed Price" | "Options" {
  const text = `${row.type ?? ""} ${row.product ?? ""}`.toUpperCase();
  return text.includes("OPT") || text.includes("OPTION") ? "Options" : "Fixed Price";
}

const MONTH_INDEX: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

function normalizeTerm(value: string | null): BackOfficePositionsTradesColumn | null {
  const raw = cleanText(value);
  if (!raw) return null;
  const dateMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dateMatch) {
    const month = dateMatch[1].padStart(2, "0");
    const day = dateMatch[2].padStart(2, "0");
    const year = dateMatch[3];
    return { key: `${year}-${month}-${day}`, label: `${month}/${day}/${year}`, type: "daily" };
  }
  const monthMatch = raw.match(/^([A-Za-z]{3})(\d{2})$/);
  if (monthMatch) {
    const month = monthMatch[1].slice(0, 3).toUpperCase();
    const year = monthMatch[2];
    if (MONTH_INDEX[month] == null) return { key: raw, label: raw, type: "monthly" };
    const key = `20${year}-${String(MONTH_INDEX[month] + 1).padStart(2, "0")}`;
    return {
      key,
      label: `${month[0]}${month.slice(1).toLowerCase()}-${year}`,
      type: "monthly",
    };
  }
  return { key: raw, label: raw, type: "monthly" };
}

function sortColumns(columns: BackOfficePositionsTradesColumn[]): BackOfficePositionsTradesColumn[] {
  const unique = new Map(columns.map((column) => [column.key, column]));
  return [...unique.values()]
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "daily" ? -1 : 1;
      return a.key.localeCompare(b.key);
    })
    .slice(0, MAX_COLUMNS);
}

function formatDateParam(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

async function loadAvailableDates(): Promise<BackOfficePositionsTradesAvailableDate[]> {
  const rows = await query<DateRow>(`
    SELECT
      nav_date::text AS nav_date,
      count(*)::integer AS row_count,
      max(sftp_upload_timestamp)::text AS latest_upload_at
    FROM nav.positions
    GROUP BY nav_date
    ORDER BY nav_date DESC
    LIMIT 120
  `);
  return rows.map((row) => ({
    navDate: row.nav_date,
    rowCount: toNumber(row.row_count),
    latestUploadAt: row.latest_upload_at,
  }));
}

async function loadAccounts(selectedDate: string): Promise<string[]> {
  const rows = await query<AccountRow>(
    `
    SELECT DISTINCT account
    FROM nav.positions
    WHERE nav_date = $1::date
      AND NULLIF(BTRIM(account), '') IS NOT NULL
    ORDER BY account
    `,
    [selectedDate],
  );
  return rows.map((row) => row.account).filter((account): account is string => Boolean(account));
}

function passesFilters(
  row: PositionRow,
  commodity: BackOfficePositionsTradesCommodity,
  instrument: BackOfficePositionsTradesInstrument,
): boolean {
  const rowCommodity = commodityFor(row);
  if (commodity === "natural_gas" && rowCommodity !== "Natural Gas") return false;
  if (commodity === "power" && rowCommodity !== "Power") return false;
  const rowInstrument = instrumentFor(row);
  if (instrument === "fixed_price" && rowInstrument !== "Fixed Price") return false;
  if (instrument === "options" && rowInstrument !== "Options") return false;
  return true;
}

function buildMatrix(
  sourceRows: PositionRow[],
  commodity: BackOfficePositionsTradesCommodity,
  instrument: BackOfficePositionsTradesInstrument,
  mark: BackOfficePositionsTradesMark,
): {
  columns: BackOfficePositionsTradesColumn[];
  rows: BackOfficePositionsTradesRow[];
} {
  const columns = sortColumns(
    sourceRows
      .map((row) => normalizeTerm(row.month_year))
      .filter((column): column is BackOfficePositionsTradesColumn => Boolean(column)),
  );
  const columnKeys = new Set(columns.map((column) => column.key));
  const rows = new Map<string, BackOfficePositionsTradesRow>();

  for (const row of sourceRows) {
    if (!passesFilters(row, commodity, instrument)) continue;
    const term = normalizeTerm(row.month_year);
    if (!term || !columnKeys.has(term.key)) continue;
    const product = displayProductName(row);
    const value =
      mark === "settlement"
        ? toNumber(row.market_value_in_base_currency)
        : toNumber(row.quantity_1);
    const existing =
      rows.get(product) ??
      {
        product,
        commodity: commodityFor(row),
        instrument: instrumentFor(row),
        values: {},
        total: 0,
      };
    existing.values[term.key] = (existing.values[term.key] ?? 0) + value;
    existing.total += value;
    rows.set(product, existing);
  }

  const matrixRows = [...rows.values()]
    .filter((row) => Math.abs(row.total) > 0.000001)
    .sort((a, b) => a.product.localeCompare(b.product))
    .slice(0, MAX_ROWS);

  return { columns, rows: matrixRows };
}

export const GET = observedJsonRoute(
  {
    route: "/api/backoffice-positions-trades",
    cacheHeader: CACHE_HEADER,
    cachePolicy: "browser-cache=120, vercel-cdn no-store",
    owner: "frontend",
    purpose: "Back Office Positions & Trades NAV term/monthly matrix.",
    p95TargetMs: 3_000,
    freshnessSource: "nav.positions.nav_date and nav.positions.sftp_upload_timestamp",
  },
  async (request) => {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.has("refresh");
    const requestedDate = formatDateParam(url.searchParams.get("asOf"));
    const cacheTtlSeconds = requestedDate ? HISTORICAL_CACHE_TTL_SECONDS : LATEST_CACHE_TTL_SECONDS;
    const { value, cacheStatus } = await getCachedRouteValue<ObservedRouteResult>({
      namespace: "/api/backoffice-positions-trades",
      key: normalizedSearchCacheKey(url.searchParams),
      ttlMs: cacheTtlSeconds * 1000,
      staleIfErrorMs: STALE_IF_ERROR_MS,
      forceRefresh,
      load: async () => {
    const availableDates = await loadAvailableDates();
    const latestDate = availableDates[0]?.navDate ?? null;
    const selectedDate =
      requestedDate && availableDates.some((date) => date.navDate === requestedDate)
        ? requestedDate
        : latestDate;
    if (!selectedDate) {
      return {
        payload: {
          source: "backoffice-positions-trades",
          generatedAt: new Date().toISOString(),
          selectedDate: null,
          latestDate: null,
          asOfLabel: "NAV --",
          availableDates,
          accounts: [],
          filters: {
            account: "All Accounts",
            commodity: "both",
            instrument: "both",
            mark: "live",
          },
          columns: [],
          rows: [],
          rowCount: 0,
          sourceRowCount: 0,
          liveLabel: "Live (0) | --",
          sourceChecks:
            "Sources: nav.positions; Spark nav.position_valuation/nav.processed_files contracts are not promoted locally",
        } satisfies BackOfficePositionsTradesPayload,
        rowCount: 0,
        dataAsOf: null,
      };
    }

    const [accounts, rows] = await Promise.all([
      loadAccounts(selectedDate),
      query<PositionRow>(
        `
        SELECT
          product,
          product_id_internal,
          type,
          month_year,
          quantity_1,
          market_value_in_base_currency,
          exchange_name
        FROM nav.positions
        WHERE nav_date = $1::date
          AND ($2::text = 'All Accounts' OR account = $2::text)
        `,
        [selectedDate, url.searchParams.get("account") || "All Accounts"],
      ),
    ]);
    const account = url.searchParams.get("account") || "All Accounts";
    const commodity = parseCommodity(url.searchParams.get("commodity"));
    const instrument = parseInstrument(url.searchParams.get("instrument"));
    const mark = parseMark(url.searchParams.get("mark"));
    const matrix = buildMatrix(rows, commodity, instrument, mark);
    const selectedDateMeta = availableDates.find((date) => date.navDate === selectedDate);
    const generatedAt = new Date();
    const payload: BackOfficePositionsTradesPayload = {
      source: "backoffice-positions-trades",
      generatedAt: generatedAt.toISOString(),
      selectedDate,
      latestDate,
      asOfLabel: `NAV ${formatTimestamp(selectedDateMeta?.latestUploadAt ?? null)}`,
      availableDates,
      accounts,
      filters: {
        account,
        commodity,
        instrument,
        mark,
      },
      columns: matrix.columns,
      rows: matrix.rows,
      rowCount: matrix.rows.length,
      sourceRowCount: rows.length,
      liveLabel: liveLabel(generatedAt, matrix.rows.length),
      sourceChecks:
        "Sources: nav.positions; Spark nav.position_valuation/nav.processed_files contracts are not promoted locally",
    };

    return {
      payload,
      rowCount: rows.length,
      dataAsOf: selectedDateMeta?.latestUploadAt ?? selectedDate,
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
