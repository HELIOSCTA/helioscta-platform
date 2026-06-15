import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const MAX_SETTLE_RANGE_DAYS = 31;
const ROUTE_CONFIG = {
  route: "/api/pjm-lmp-settles",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "PJM DA/RT daily settle comparison data",
  p95TargetMs: 1_500,
  freshnessSource: "pjm.da_hrl_lmps.updated_at and RT source updated_at",
} as const;

type ComponentKey = "energy" | "congestion" | "loss" | "total";
type RtSource = "verified" | "unverified";

interface RtSourceConfig {
  rtSource: RtSource;
  sourceTable: "pjm.rt_hrl_lmps" | "pjm.rt_unverified_hrl_lmps";
  currentFilter: string;
}

interface HourRow {
  market_date: string;
  hour_ending: number;
  value: number | string | null;
  as_of: string | null;
}

function parseDate(value: string | null, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function parseComponent(value: string | null): ComponentKey {
  return value === "energy" || value === "congestion" || value === "loss" ? value : "total";
}

function parseRtSource(value: string | null): RtSource {
  return value === "verified" ? "verified" : "unverified";
}

function rtSourceConfig(rtSource: RtSource): RtSourceConfig {
  if (rtSource === "verified") {
    return {
      rtSource,
      sourceTable: "pjm.rt_hrl_lmps",
      currentFilter: "and row_is_current = true",
    };
  }

  return {
    rtSource,
    sourceTable: "pjm.rt_unverified_hrl_lmps",
    currentFilter: "",
  };
}

function componentExpr(prefix: string, market: "da" | "rt", component: ComponentKey): string {
  const suffix = market === "da" ? "da" : "rt";
  if (market === "rt" && component === "energy") {
    return `(${prefix}.total_lmp_rt - ${prefix}.congestion_price_rt - ${prefix}.marginal_loss_price_rt)`;
  }
  if (component === "energy") return `${prefix}.system_energy_price_${suffix}`;
  if (component === "congestion") return `${prefix}.congestion_price_${suffix}`;
  if (component === "loss") return `${prefix}.marginal_loss_price_${suffix}`;
  return `${prefix}.total_lmp_${suffix}`;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyHours(): Array<number | null> {
  return Array.from({ length: 24 }, () => null);
}

function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`);
  while (cursor <= stop) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function inclusiveDayCount(start: string, end: string): number {
  const startTime = new Date(`${start}T00:00:00Z`).getTime();
  const endTime = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return 0;
  return Math.floor((endTime - startTime) / 86_400_000) + 1;
}

function maxStamp(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const startDate = parseDate(searchParams.get("start"), today);
  const endDate = parseDate(searchParams.get("end"), startDate);
  const hub = searchParams.get("hub") || "WESTERN HUB";
  const component = parseComponent(searchParams.get("component"));
  const rtConfig = rtSourceConfig(parseRtSource(searchParams.get("rtSource")));
  const dayCount = inclusiveDayCount(startDate, endDate);

  if (dayCount < 1) {
    return {
      status: 400,
      payload: { error: "end must be on or after start" },
      headers: { "Cache-Control": "no-store" },
    };
  }
  if (dayCount > MAX_SETTLE_RANGE_DAYS) {
    return {
      status: 400,
      payload: {
        error: `Date range cannot exceed ${MAX_SETTLE_RANGE_DAYS} days`,
        maxDays: MAX_SETTLE_RANGE_DAYS,
      },
      headers: { "Cache-Control": "no-store" },
    };
  }

  const daValue = componentExpr("lmps", "da", component);
  const rtValue = componentExpr("lmps", "rt", component);
  const [daRows, rtRows] = await Promise.all([
    query<HourRow>(
      `
        select
          datetime_beginning_ept::date::text as market_date,
          (extract(hour from datetime_beginning_ept)::int + 1) as hour_ending,
          ${daValue}::float8 as value,
          to_char(max(updated_at) over (partition by datetime_beginning_ept::date), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from pjm.da_hrl_lmps as lmps
        where row_is_current = true
          and pnode_name = $1
          and datetime_beginning_ept::date between $2::date and $3::date
        order by datetime_beginning_ept
      `,
      [hub, startDate, endDate],
    ),
    query<HourRow>(
      `
        select
          datetime_beginning_ept::date::text as market_date,
          (extract(hour from datetime_beginning_ept)::int + 1) as hour_ending,
          ${rtValue}::float8 as value,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ${rtConfig.sourceTable} as lmps
        where pnode_name = $1
          and datetime_beginning_ept::date between $2::date and $3::date
          ${rtConfig.currentFilter}
        order by datetime_beginning_ept::date, extract(hour from datetime_beginning_ept)
      `,
      [hub, startDate, endDate],
    ),
  ]);

  const daByDate = new Map<string, { values: Array<number | null>; asOf: string | null }>();
  const rtByDate = new Map<string, { values: Array<number | null>; asOf: string | null }>();
  for (const row of daRows) {
    const item = daByDate.get(row.market_date) ?? { values: emptyHours(), asOf: null };
    item.values[Number(row.hour_ending) - 1] = toNumber(row.value);
    item.asOf = maxStamp([item.asOf, row.as_of]);
    daByDate.set(row.market_date, item);
  }
  for (const row of rtRows) {
    const item = rtByDate.get(row.market_date) ?? { values: emptyHours(), asOf: null };
    item.values[Number(row.hour_ending) - 1] = toNumber(row.value);
    item.asOf = maxStamp([item.asOf, row.as_of]);
    rtByDate.set(row.market_date, item);
  }

  const rows = dateRange(startDate, endDate).map((date) => {
    const jsDate = new Date(`${date}T00:00:00Z`);
    const da = daByDate.get(date);
    const rt = rtByDate.get(date);
    return {
      date,
      hub,
      isWeekend: jsDate.getUTCDay() === 0 || jsDate.getUTCDay() === 6,
      isNercHoliday: false,
      holidayName: null,
      daHourly: da?.values ?? emptyHours(),
      rtHourly: rt?.values ?? emptyHours(),
      daAsOf: da?.asOf ?? null,
      rtAsOf: rt?.asOf ?? null,
    };
  });
  const latestAsOf = maxStamp(rows.flatMap((row) => [row.daAsOf, row.rtAsOf]));

  return {
    payload: {
      startDate,
      endDate,
      hub,
      component,
      rtSource: rtConfig.rtSource,
      rtSourceTable: rtConfig.sourceTable,
      maxRangeDays: MAX_SETTLE_RANGE_DAYS,
      rowCount: rows.length,
      summary: {
        rowCount: rows.length,
        latestDate: rows.at(-1)?.date ?? null,
        latestAsOf,
      },
      rows,
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: rows.length,
    dataAsOf: latestAsOf,
  };
});
