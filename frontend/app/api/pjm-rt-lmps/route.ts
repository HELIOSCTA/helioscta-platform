import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const ROUTE_CONFIG = {
  route: "/api/pjm-rt-lmps",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "PJM real-time LMP dashboard data",
  p95TargetMs: 1_000,
  freshnessSource: "pjm.rt_hrl_lmps.updated_at or pjm.rt_unverified_hrl_lmps.updated_at",
} as const;
const REPORT_HUBS = [
  "WESTERN HUB",
  "EASTERN HUB",
  "AEP-DAYTON HUB",
  "DOMINION HUB",
  "NEW JERSEY HUB",
  "CHICAGO HUB",
  "OHIO HUB",
  "N ILLINOIS HUB",
  "AEP GEN HUB",
  "ATSI GEN HUB",
  "CHICAGO GEN HUB",
  "WEST INT HUB",
] as const;

interface RtLmpRow {
  datetime_beginning_ept: string;
  pnode_name: string;
  hour_ending: number;
  system_energy_price_rt: number | string | null;
  total_lmp_rt: number | string | null;
  congestion_price_rt: number | string | null;
  marginal_loss_price_rt: number | string | null;
  as_of: string | null;
}

type RtSource = "verified" | "unverified";

interface RtSourceConfig {
  rtSource: RtSource;
  sourceTable: "pjm.rt_hrl_lmps" | "pjm.rt_unverified_hrl_lmps";
  energyExpr: string;
  currentFilter: string;
}

function parseDate(raw: string | null): string | null {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function parseRtSource(raw: string | null): RtSource {
  return raw === "verified" ? "verified" : "unverified";
}

function rtSourceConfig(rtSource: RtSource): RtSourceConfig {
  if (rtSource === "verified") {
    return {
      rtSource,
      sourceTable: "pjm.rt_hrl_lmps",
      energyExpr: "system_energy_price_rt",
      currentFilter: "and row_is_current = true",
    };
  }

  return {
    rtSource,
    sourceTable: "pjm.rt_unverified_hrl_lmps",
    energyExpr:
      "(total_lmp_rt - congestion_price_rt - marginal_loss_price_rt)",
    currentFilter: "",
  };
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value !== null);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function summarizeHub(hub: string, rows: RtLmpRow[]) {
  const hourly = rows.map((row) => ({
    hourEnding: Number(row.hour_ending),
    datetimeBeginningEpt: row.datetime_beginning_ept,
    total: toNumber(row.total_lmp_rt),
    systemEnergy: toNumber(row.system_energy_price_rt),
    congestion: toNumber(row.congestion_price_rt),
    marginalLoss: toNumber(row.marginal_loss_price_rt),
  }));
  const onPeak = hourly.filter((row) => row.hourEnding >= 8 && row.hourEnding <= 23);
  const offPeak = hourly.filter((row) => row.hourEnding < 8 || row.hourEnding > 23);
  const peak = hourly.reduce<(typeof hourly)[number] | null>((best, row) => {
    if (row.total === null) return best;
    return !best || best.total === null || row.total > best.total ? row : best;
  }, null);
  return {
    hub,
    onPeakAvg: avg(onPeak.map((row) => row.total)),
    offPeakAvg: avg(offPeak.map((row) => row.total)),
    flatAvg: avg(hourly.map((row) => row.total)),
    peakHour: peak?.hourEnding ?? null,
    peakPrice: peak?.total ?? null,
    hourly,
  };
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const requestedDate = parseDate(searchParams.get("date"));
  const rtConfig = rtSourceConfig(parseRtSource(searchParams.get("source")));

  const latest = await query<{ target_date: string | null }>(
    `
      select max(datetime_beginning_ept::date)::text as target_date
      from ${rtConfig.sourceTable}
      where pnode_name = any($1::text[])
        ${rtConfig.currentFilter}
    `,
    [REPORT_HUBS],
  );
  const latestDate = latest[0]?.target_date ?? null;
  const targetDate = requestedDate ?? latestDate;
  if (!targetDate) {
    return {
      status: 404,
      payload: { error: "No PJM RT LMP data is available" },
      headers: { "Cache-Control": "no-store", "X-Pjm-Rt-Lmps-Cache": "MISS" },
    };
  }

  const rows = await query<RtLmpRow>(
    `
      select
        to_char(datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
        pnode_name,
        (extract(hour from datetime_beginning_ept)::int + 1) as hour_ending,
        ${rtConfig.energyExpr}::float8 as system_energy_price_rt,
        total_lmp_rt::float8 as total_lmp_rt,
        congestion_price_rt::float8 as congestion_price_rt,
        marginal_loss_price_rt::float8 as marginal_loss_price_rt,
        to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
      from ${rtConfig.sourceTable}
      where datetime_beginning_ept::date = $1::date
        and pnode_name = any($2::text[])
        ${rtConfig.currentFilter}
      order by array_position($2::text[], pnode_name), datetime_beginning_ept
    `,
    [targetDate, REPORT_HUBS],
  );
  const asOf = rows.reduce<string | null>(
    (best, row) => (row.as_of && (!best || row.as_of > best) ? row.as_of : best),
    null,
  );

  return {
    payload: {
      targetDate,
      latestDate,
      asOf,
      source: rtConfig.sourceTable,
      rtSource: rtConfig.rtSource,
      hubs: REPORT_HUBS.map((hub) =>
        summarizeHub(
          hub,
          rows.filter((row) => row.pnode_name === hub),
        ),
      ),
    },
    headers: { "Cache-Control": CACHE_HEADER, "X-Pjm-Rt-Lmps-Cache": "MISS" },
    rowCount: rows.length,
    dataAsOf: asOf,
  };
});
