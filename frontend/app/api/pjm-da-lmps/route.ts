import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const ROUTE_CONFIG = {
  route: "/api/pjm-da-lmps",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "PJM day-ahead LMP dashboard data",
  p95TargetMs: 750,
  freshnessSource: "pjm.da_hrl_lmps.updated_at",
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

interface LmpRow {
  datetime_beginning_ept: string;
  pnode_name: string;
  hour_ending: number;
  system_energy_price_da: number | string | null;
  total_lmp_da: number | string | null;
  congestion_price_da: number | string | null;
  marginal_loss_price_da: number | string | null;
  as_of: string | null;
}

function parseDate(raw: string | null): string | null {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
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

function summarizeHub(hub: string, rows: LmpRow[]) {
  const hourly = rows.map((row) => ({
    hourEnding: Number(row.hour_ending),
    datetimeBeginningEpt: row.datetime_beginning_ept,
    total: toNumber(row.total_lmp_da),
    systemEnergy: toNumber(row.system_energy_price_da),
    congestion: toNumber(row.congestion_price_da),
    marginalLoss: toNumber(row.marginal_loss_price_da),
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

  const latest = await query<{ target_date: string | null }>(
    `
      select max(datetime_beginning_ept::date)::text as target_date
      from pjm.da_hrl_lmps
      where row_is_current = true
        and pnode_name = any($1::text[])
    `,
    [REPORT_HUBS],
  );
  const latestDate = latest[0]?.target_date ?? null;
  const targetDate = requestedDate ?? latestDate;
  if (!targetDate) {
    return {
      status: 404,
      payload: { error: "No PJM DA LMP data is available" },
      headers: { "Cache-Control": "no-store", "X-Power-Da-Lmps-Cache": "MISS" },
    };
  }

  const rows = await query<LmpRow>(
    `
      select
        to_char(datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
        pnode_name,
        (extract(hour from datetime_beginning_ept)::int + 1) as hour_ending,
        system_energy_price_da,
        total_lmp_da,
        congestion_price_da,
        marginal_loss_price_da,
        to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
      from pjm.da_hrl_lmps
      where row_is_current = true
        and datetime_beginning_ept::date = $1::date
        and pnode_name = any($2::text[])
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
      iso: "pjm",
      targetDate,
      latestDate,
      asOf,
      source: "pjm.da_hrl_lmps",
      hubs: REPORT_HUBS.map((hub) =>
        summarizeHub(
          hub,
          rows.filter((row) => row.pnode_name === hub),
        ),
      ),
    },
    headers: { "Cache-Control": CACHE_HEADER, "X-Power-Da-Lmps-Cache": "MISS" },
    rowCount: rows.length,
    dataAsOf: asOf,
  };
});
