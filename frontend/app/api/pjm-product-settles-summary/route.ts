import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import icePowerRegistryJson from "@/lib/powerPricing/ice_power_registry.json";
import { buildNercOffPeakDaysValuesSql } from "@/lib/tradingCalendars";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const MARKET_TIME_ZONE = "America/New_York";
const ROUTE_CONFIG = {
  route: "/api/pjm-product-settles-summary",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "PJM registry-product month-to-date LMP settlement summary",
  p95TargetMs: 2_500,
  freshnessSource: "pjm.da_hrl_lmps, pjm.rt_hrl_lmps, or pjm.rt_unverified_hrl_lmps updated_at",
} as const;

type ComponentKey = "total" | "energy" | "congestion" | "loss";
type Market = "DA" | "RT";
type RtSource = "verified" | "unverified";
type ProductPeriod = "5x16" | "7x8" | "wrap";
type Status = "Complete" | "Partial" | "Missing" | "No hours";

interface RegistryEntry {
  active?: unknown;
  cc?: unknown;
  contract_code?: unknown;
  contract_label?: unknown;
  contract_type?: unknown;
  description?: unknown;
  hour_bucket?: unknown;
  hours?: unknown;
  hub?: unknown;
  ice_contract_symbol?: unknown;
  ice_product_id?: unknown;
  ice_product_url?: unknown;
  market?: unknown;
  metadata_status?: unknown;
  pjm_pnode_name?: unknown;
  product?: unknown;
  product_name?: unknown;
  shape?: unknown;
  source_registry?: unknown;
  symbol?: unknown;
}

interface RegistryRoot {
  futures?: { pjm?: unknown };
  shortTerm?: { pjm?: unknown };
  productDictionary?: unknown;
  metadata?: {
    generatedAt?: unknown;
    productDictionaryCount?: unknown;
    shortTermCount?: unknown;
    futuresProductCount?: unknown;
  };
}

interface ProductMetadata {
  productKey: string;
  product: string;
  contract: string;
  contractCode: string | null;
  contractType: string | null;
  productName: string;
  description: string | null;
  hub: string;
  pjmPnodeName: string;
  market: Market;
  shape: string;
  period: ProductPeriod;
  hours: string;
  iceProductUrl: string | null;
  metadataStatus: string | null;
  registrySource: string;
}

interface ProductQueryRow {
  productKey: string;
  pnodeName: string;
  market: Market;
  period: ProductPeriod;
}

interface SummarySqlRow {
  product_key: string;
  mtd_avg: number | string | null;
  obs: number | string | null;
  hourly_obs: number | string | null;
  expected_days: number | string | null;
  expected_hours: number | string | null;
  min_date: string | null;
  max_date: string | null;
  as_of: string | null;
}

interface SummaryByProduct {
  mtdAvg: number | null;
  obs: number;
  hourlyObs: number;
  expectedDays: number;
  expectedHours: number;
  minDate: string | null;
  maxDate: string | null;
  asOf: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EPT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: MARKET_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayEntries(value: unknown): RegistryEntry[] {
  return Array.isArray(value) ? (value as RegistryEntry[]) : [];
}

function registryRoot(): RegistryRoot {
  return icePowerRegistryJson as unknown as RegistryRoot;
}

function normalizeMarket(value: unknown): Market | null {
  const normalized = text(value)?.toUpperCase();
  if (normalized === "DA" || normalized === "RT") return normalized;
  return null;
}

function periodFromShape(entry: RegistryEntry): ProductPeriod | null {
  const shape = text(entry.shape)?.toLowerCase() ?? "";
  const hourBucket = text(entry.hour_bucket)?.toLowerCase() ?? "";
  const hours = text(entry.hours)?.toLowerCase() ?? "";

  if (hourBucket === "onpeak" || (shape.includes("peak") && !shape.includes("off"))) {
    return "5x16";
  }
  if (!shape.includes("off") && hourBucket !== "offpeak") return null;
  if (hours.includes("weekend") || hours.includes("holiday")) {
    return "wrap";
  }
  if (shape.includes("7x8") || hours.includes("0100-he 0700")) {
    return "7x8";
  }
  return "7x8";
}

function registryProduct(entry: RegistryEntry): string | null {
  return text(entry.product) ?? text(entry.cc) ?? text(entry.ice_contract_symbol);
}

function dedupeKey(entry: RegistryEntry, market: Market, period: ProductPeriod): string {
  return [
    text(entry.pjm_pnode_name),
    market,
    period,
    registryProduct(entry),
    text(entry.contract_code),
    text(entry.ice_product_url) ?? text(entry.ice_product_id),
  ]
    .map((part) => part ?? "")
    .join("|")
    .toLowerCase();
}

function buildProductKey(entry: RegistryEntry, market: Market, period: ProductPeriod): string {
  return [
    text(entry.pjm_pnode_name),
    market,
    period,
    registryProduct(entry),
    text(entry.contract_code),
    text(entry.ice_product_id) ?? text(entry.ice_product_url),
  ]
    .map((part) => (part ?? "na").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join(":");
}

function pjmRegistryProducts(): ProductMetadata[] {
  const registry = registryRoot();
  const sources: Array<{ label: string; entries: RegistryEntry[] }> = [
    { label: "futures.pjm", entries: arrayEntries(registry.futures?.pjm) },
    { label: "shortTerm.pjm", entries: arrayEntries(registry.shortTerm?.pjm) },
    { label: "productDictionary", entries: arrayEntries(registry.productDictionary) },
  ];
  const seen = new Set<string>();
  const products: ProductMetadata[] = [];

  for (const source of sources) {
    for (const entry of source.entries) {
      if (entry.active === false) continue;
      const pnode = text(entry.pjm_pnode_name);
      const market = normalizeMarket(entry.market);
      const period = periodFromShape(entry);
      const product = registryProduct(entry);
      if (!pnode || !market || !period || !product) continue;

      const key = dedupeKey(entry, market, period);
      if (seen.has(key)) continue;
      seen.add(key);

      const contract =
        text(entry.contract_label) ??
        text(entry.contract_code) ??
        text(entry.contract_type) ??
        "Contract";
      const productName = text(entry.product_name) ?? text(entry.description) ?? product;

      products.push({
        productKey: buildProductKey(entry, market, period),
        product,
        contract,
        contractCode: text(entry.contract_code),
        contractType: text(entry.contract_type),
        productName,
        description: text(entry.description),
        hub: text(entry.hub) ?? pnode,
        pjmPnodeName: pnode,
        market,
        shape: text(entry.shape) ?? period,
        period,
        hours: text(entry.hours) ?? period,
        iceProductUrl: text(entry.ice_product_url),
        metadataStatus: text(entry.metadata_status),
        registrySource: source.label,
      });
    }
  }

  return products.sort((left, right) => {
    const pnodeSort = left.pjmPnodeName.localeCompare(right.pjmPnodeName);
    if (pnodeSort !== 0) return pnodeSort;
    const marketSort = left.market.localeCompare(right.market);
    if (marketSort !== 0) return marketSort;
    const periodSort = left.period.localeCompare(right.period);
    if (periodSort !== 0) return periodSort;
    return left.product.localeCompare(right.product);
  });
}

function datePartsInEpt(date: Date): { year: number; month: number; day: number } {
  const parts = EPT_DATE_FORMATTER.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return { year, month, day };
}

function isoDateFromParts(parts: { year: number; month: number; day: number }): string {
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function yesterdayEpt(): string {
  return addDays(isoDateFromParts(datePartsInEpt(new Date())), -1);
}

function parseEndDate(value: string | null): string {
  const fallback = yesterdayEpt();
  if (!value || !DATE_RE.test(value)) return fallback;
  return value > fallback ? fallback : value;
}

function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function parseComponent(value: string | null): ComponentKey {
  if (value === "energy" || value === "congestion" || value === "loss") return value;
  return "total";
}

function parseRtSource(value: string | null): RtSource {
  return value === "unverified" ? "unverified" : "verified";
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value: number | string | null | undefined): number {
  const parsed = toNumber(value);
  return parsed === null ? 0 : Math.trunc(parsed);
}

function statusForSummary(summary: SummaryByProduct): Status {
  if (summary.expectedDays === 0 || summary.expectedHours === 0) return "No hours";
  if (summary.obs === 0 || summary.hourlyObs === 0) return "Missing";
  if (summary.obs >= summary.expectedDays && summary.hourlyObs >= summary.expectedHours) {
    return "Complete";
  }
  return "Partial";
}

function componentExpression(prefix: string, market: Market, component: ComponentKey, rtSource: RtSource): string {
  const suffix = market === "DA" ? "da" : "rt";
  if (market === "RT" && component === "energy" && rtSource === "unverified") {
    return `(${prefix}.total_lmp_rt - ${prefix}.congestion_price_rt - ${prefix}.marginal_loss_price_rt)`;
  }
  if (component === "energy") return `${prefix}.system_energy_price_${suffix}`;
  if (component === "congestion") return `${prefix}.congestion_price_${suffix}`;
  if (component === "loss") return `${prefix}.marginal_loss_price_${suffix}`;
  return `${prefix}.total_lmp_${suffix}`;
}

function buildSql(startYear: number, endYear: number, rtSource: RtSource, component: ComponentKey): string {
  const daValue = componentExpression("lmps", "DA", component, rtSource);
  const rtValue = componentExpression("lmps", "RT", component, rtSource);
  const rtSourceTable = rtSource === "unverified" ? "pjm.rt_unverified_hrl_lmps" : "pjm.rt_hrl_lmps";
  const rtCurrentFilter = rtSource === "verified" ? "AND lmps.row_is_current = true" : "";
  const rtTypeFilter = rtSource === "unverified" ? "AND lmps.type = 'HUB'" : "";

  return `
    WITH params AS (
      SELECT
        $1::date AS start_date,
        $2::date AS end_date
    ),
    products AS (
      SELECT
        product_key,
        pnode_name,
        market,
        period
      FROM jsonb_to_recordset($3::jsonb)
        AS product(product_key text, pnode_name text, market text, period text)
    ),
    nerc_off_peak_days AS (
${buildNercOffPeakDaysValuesSql(startYear, endYear)}
    ),
    calendar_days AS (
      SELECT
        series.market_date::date AS market_date,
        (
          EXTRACT(ISODOW FROM series.market_date)::integer IN (6, 7)
          OR nerc_off_peak_days.holiday_date IS NOT NULL
        ) AS is_off_peak_day
      FROM generate_series(
        (SELECT start_date FROM params),
        (SELECT end_date FROM params),
        '1 day'::interval
      ) AS series(market_date)
      LEFT JOIN nerc_off_peak_days
        ON nerc_off_peak_days.holiday_date = series.market_date::date
    ),
    expected AS (
      SELECT
        products.product_key,
        COUNT(*) FILTER (
          WHERE products.period <> '5x16' OR NOT calendar_days.is_off_peak_day
        )::integer AS expected_days,
        COALESCE(SUM(
          CASE products.period
            WHEN '5x16' THEN CASE WHEN NOT calendar_days.is_off_peak_day THEN 16 ELSE 0 END
            WHEN '7x8' THEN 8
            WHEN 'wrap' THEN CASE WHEN calendar_days.is_off_peak_day THEN 24 ELSE 8 END
            ELSE 0
          END
        ), 0)::integer AS expected_hours
      FROM products
      CROSS JOIN calendar_days
      GROUP BY products.product_key
    ),
    source_hourly AS (
      SELECT
        products.product_key,
        products.period,
        lmps.datetime_beginning_ept::date AS market_date,
        EXTRACT(HOUR FROM lmps.datetime_beginning_ept)::integer + 1 AS hour_ending,
        ${daValue}::double precision AS value,
        lmps.updated_at AS as_of
      FROM products
      CROSS JOIN params
      JOIN pjm.da_hrl_lmps AS lmps
        ON products.market = 'DA'
       AND lmps.pnode_name = products.pnode_name
       AND lmps.row_is_current = true
       AND lmps.datetime_beginning_ept::date BETWEEN params.start_date AND params.end_date

      UNION ALL

      SELECT
        products.product_key,
        products.period,
        lmps.datetime_beginning_ept::date AS market_date,
        EXTRACT(HOUR FROM lmps.datetime_beginning_ept)::integer + 1 AS hour_ending,
        ${rtValue}::double precision AS value,
        lmps.updated_at AS as_of
      FROM products
      CROSS JOIN params
      JOIN ${rtSourceTable} AS lmps
       ON products.market = 'RT'
       AND lmps.pnode_name = products.pnode_name
       ${rtCurrentFilter}
       ${rtTypeFilter}
       AND lmps.datetime_beginning_ept::date BETWEEN params.start_date AND params.end_date
    ),
    selected_hourly AS (
      SELECT
        source_hourly.product_key,
        source_hourly.market_date,
        source_hourly.value,
        source_hourly.as_of
      FROM source_hourly
      JOIN calendar_days
        ON calendar_days.market_date = source_hourly.market_date
      WHERE CASE source_hourly.period
        WHEN '5x16' THEN NOT calendar_days.is_off_peak_day
          AND source_hourly.hour_ending BETWEEN 8 AND 23
        WHEN '7x8' THEN source_hourly.hour_ending < 8
          OR source_hourly.hour_ending > 23
        WHEN 'wrap' THEN source_hourly.hour_ending < 8
          OR source_hourly.hour_ending > 23
          OR calendar_days.is_off_peak_day
        ELSE false
      END
    ),
    daily AS (
      SELECT
        product_key,
        market_date,
        AVG(value) AS daily_value,
        COUNT(value)::integer AS hourly_obs,
        MAX(as_of) AS as_of
      FROM selected_hourly
      GROUP BY product_key, market_date
    ),
    summary AS (
      SELECT
        products.product_key,
        ROUND(AVG(daily.daily_value)::numeric, 2) AS mtd_avg,
        COUNT(daily.daily_value)::integer AS obs,
        COALESCE(SUM(daily.hourly_obs), 0)::integer AS hourly_obs,
        expected.expected_days,
        expected.expected_hours,
        MIN(daily.market_date)::text AS min_date,
        MAX(daily.market_date)::text AS max_date,
        to_char(MAX(daily.as_of), 'YYYY-MM-DD"T"HH24:MI:SS') AS as_of
      FROM products
      JOIN expected
        ON expected.product_key = products.product_key
      LEFT JOIN daily
        ON daily.product_key = products.product_key
      GROUP BY
        products.product_key,
        expected.expected_days,
        expected.expected_hours
    )
    SELECT *
    FROM summary
    ORDER BY product_key;
  `;
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";
  const endDate = parseEndDate(searchParams.get("end"));
  const startDate = monthStart(endDate);
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  const component = parseComponent(searchParams.get("component"));
  const rtSource = parseRtSource(searchParams.get("rtSource"));
  const products = pjmRegistryProducts();
  const productRows: ProductQueryRow[] = products.map((product) => ({
    productKey: product.productKey,
    pnodeName: product.pjmPnodeName,
    market: product.market,
    period: product.period,
  }));

  const summaryRows = await query<SummarySqlRow>(buildSql(startYear, endYear, rtSource, component), [
    startDate,
    endDate,
    JSON.stringify(productRows.map((product) => ({
      product_key: product.productKey,
      pnode_name: product.pnodeName,
      market: product.market,
      period: product.period,
    }))),
  ]);
  const summaryByProduct = new Map<string, SummaryByProduct>(
    summaryRows.map((row) => [
      row.product_key,
      {
        mtdAvg: toNumber(row.mtd_avg),
        obs: toInteger(row.obs),
        hourlyObs: toInteger(row.hourly_obs),
        expectedDays: toInteger(row.expected_days),
        expectedHours: toInteger(row.expected_hours),
        minDate: row.min_date,
        maxDate: row.max_date,
        asOf: row.as_of,
      },
    ]),
  );
  const registry = registryRoot();
  const dataAsOf =
    summaryRows
      .map((row) => row.as_of)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  const rows = products.map((product) => {
    const summary =
      summaryByProduct.get(product.productKey) ?? {
        mtdAvg: null,
        obs: 0,
        hourlyObs: 0,
        expectedDays: 0,
        expectedHours: 0,
        minDate: null,
        maxDate: null,
        asOf: null,
      };
    return {
      product: product.product,
      contract: product.contract,
      contractCode: product.contractCode,
      contractType: product.contractType,
      productName: product.productName,
      description: product.description,
      hub: product.hub,
      pjmPnodeName: product.pjmPnodeName,
      market: product.market,
      shape: product.shape,
      period: product.period,
      hours: product.hours,
      mtdAvg: summary.mtdAvg,
      obs: summary.obs,
      hourlyObs: summary.hourlyObs,
      expectedDays: summary.expectedDays,
      expectedHours: summary.expectedHours,
      status: statusForSummary(summary),
      iceProductUrl: product.iceProductUrl,
      metadataStatus: product.metadataStatus,
      registrySource: product.registrySource,
      minDate: summary.minDate,
      maxDate: summary.maxDate,
      asOf: summary.asOf,
    };
  });

  return {
    payload: {
      iso: "pjm",
      source: "PJM hourly LMPs with ICE power registry product metadata",
      marketTimeZone: MARKET_TIME_ZONE,
      startDate,
      endDate,
      component,
      rtSource,
      rowCount: rows.length,
      rows,
      metadata: {
        registryGeneratedAt: text(registry.metadata?.generatedAt),
        dedupeSources: ["futures.pjm", "shortTerm.pjm", "productDictionary"],
        registryProductCount: rows.length,
        sourceTables: {
          da: "pjm.da_hrl_lmps",
          rt: rtSource === "unverified" ? "pjm.rt_unverified_hrl_lmps" : "pjm.rt_hrl_lmps",
        },
      },
    },
    headers: {
      "Cache-Control": forceRefresh ? "no-store" : CACHE_HEADER,
      "X-Pjm-Product-Settles-Summary-Cache": "MISS",
    },
    rowCount: rows.length,
    dataAsOf,
  };
});
