import "server-only";

import { query } from "@/lib/server/db";
export type PowerIso = "pjm" | "ercot" | "isone" | "caiso" | "miso" | "spp" | "nyiso";
export type PowerLmpProduct = "da" | "rt";
export type RtLmpSource = "verified" | "unverified";
export type ComponentKey = "energy" | "congestion" | "loss" | "total";
export type PowerSettlesDashboardComponent = "total" | "energy" | "congestion" | "loss";

const PJM_HUBS = [
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

const ERCOT_HUBS = ["HB_NORTH", "HB_SOUTH", "HB_WEST", "HB_HOUSTON"] as const;
const ISONE_HUBS = [".H.INTERNAL_HUB"] as const;
const CAISO_HUBS = ["TH_SP15_GEN-APND", "TH_NP15_GEN-APND"] as const;
const MISO_HUBS = [
  "INDIANA.HUB",
  "ARKANSAS.HUB",
  "ILLINOIS.HUB",
  "LOUISIANA.HUB",
  "MICHIGAN.HUB",
  "MINN.HUB",
  "TEXAS.HUB",
] as const;
const SPP_HUBS = ["SPPNORTH_HUB", "SPPSOUTH_HUB"] as const;
const NYISO_HUBS = [
  "WEST",
  "GENESE",
  "CENTRL",
  "NORTH",
  "MHK VL",
  "CAPITL",
  "HUD VL",
  "MILLWD",
  "DUNWOD",
  "N.Y.C.",
  "LONGIL",
] as const;
const PJM_DASHBOARD_HUBS = PJM_HUBS;
const ERCOT_DASHBOARD_HUBS = ERCOT_HUBS;
const ISONE_DASHBOARD_HUBS = ISONE_HUBS;
const CAISO_DASHBOARD_HUBS = CAISO_HUBS;
const MISO_DASHBOARD_HUBS = MISO_HUBS;
const SPP_DASHBOARD_HUBS = SPP_HUBS;
const NYISO_DASHBOARD_HUBS = NYISO_HUBS;
export const POWER_SETTLES_DASHBOARD_DEFAULT_RT_SOURCE: RtLmpSource = "verified";

interface IsoConfig {
  iso: PowerIso;
  label: string;
  defaultHub: string;
  hubs: readonly string[];
  dashboardHubs: readonly string[];
  supportsComponents: boolean;
}

const ISO_CONFIGS: Record<PowerIso, IsoConfig> = {
  pjm: {
    iso: "pjm",
    label: "PJM",
    defaultHub: "WESTERN HUB",
    hubs: PJM_HUBS,
    dashboardHubs: PJM_DASHBOARD_HUBS,
    supportsComponents: true,
  },
  ercot: {
    iso: "ercot",
    label: "ERCOT",
    defaultHub: "HB_NORTH",
    hubs: ERCOT_HUBS,
    dashboardHubs: ERCOT_DASHBOARD_HUBS,
    supportsComponents: false,
  },
  isone: {
    iso: "isone",
    label: "ISO-NE",
    defaultHub: ".H.INTERNAL_HUB",
    hubs: ISONE_HUBS,
    dashboardHubs: ISONE_DASHBOARD_HUBS,
    supportsComponents: true,
  },
  caiso: {
    iso: "caiso",
    label: "CAISO",
    defaultHub: "TH_SP15_GEN-APND",
    hubs: CAISO_HUBS,
    dashboardHubs: CAISO_DASHBOARD_HUBS,
    supportsComponents: true,
  },
  miso: {
    iso: "miso",
    label: "MISO",
    defaultHub: "INDIANA.HUB",
    hubs: MISO_HUBS,
    dashboardHubs: MISO_DASHBOARD_HUBS,
    supportsComponents: true,
  },
  spp: {
    iso: "spp",
    label: "SPP",
    defaultHub: "SPPNORTH_HUB",
    hubs: SPP_HUBS,
    dashboardHubs: SPP_DASHBOARD_HUBS,
    supportsComponents: true,
  },
  nyiso: {
    iso: "nyiso",
    label: "NYISO",
    defaultHub: "N.Y.C.",
    hubs: NYISO_HUBS,
    dashboardHubs: NYISO_DASHBOARD_HUBS,
    supportsComponents: true,
  },
};

const POWER_SETTLES_DASHBOARD_ISOS: PowerIso[] = ["pjm", "ercot", "isone", "caiso"];

const PEAK_WINDOW_BY_ISO: Record<PowerIso, { start: number; end: number }> = {
  pjm: { start: 8, end: 23 },
  ercot: { start: 7, end: 22 },
  isone: { start: 8, end: 23 },
  caiso: { start: 7, end: 22 },
  miso: { start: 7, end: 22 },
  spp: { start: 7, end: 22 },
  nyiso: { start: 8, end: 23 },
};

interface LmpRow {
  datetime_beginning_ept: string;
  hub: string;
  hour_ending: number;
  system_energy: number | string | null;
  total: number | string | null;
  congestion: number | string | null;
  marginal_loss: number | string | null;
  as_of: string | null;
}

interface HourRow {
  market_date: string;
  hour_ending: number;
  value: number | string | null;
  as_of: string | null;
}

type PowerSettlesDashboardStatus = "ok" | "partial" | "missing";
export type PowerSettlesDashboardRtSourceStatus = "requested" | "fallback" | "single-source";

interface HourlyValueSet {
  values: Array<number | null>;
  asOf: string | null;
}

export interface PowerSettlesDashboardProductSummary {
  flatAvg: number | null;
  onPeakAvg: number | null;
  offPeakAvg: number | null;
  peakHour: number | null;
  peakPrice: number | null;
  observationCount: number;
}

export interface PowerSettlesDashboardIsoRow {
  iso: PowerIso;
  isoLabel: string;
  hub: string;
  effectiveComponent: PowerSettlesDashboardComponent;
  effectiveRtSource: RtLmpSource;
  rtSourceStatus: PowerSettlesDashboardRtSourceStatus;
  targetDate: string | null;
  latestDaDate: string | null;
  latestRtDate: string | null;
  daAsOf: string | null;
  rtAsOf: string | null;
  dataAsOf: string | null;
  sourceTables: {
    da: string;
    rt: string;
  };
  status: PowerSettlesDashboardStatus;
  statusDetail: string;
  detailUrl: string | null;
  products: {
    da: PowerSettlesDashboardProductSummary;
    rt: PowerSettlesDashboardProductSummary;
    dart: PowerSettlesDashboardProductSummary;
  };
}

export interface PowerSettlesDashboardPayload {
  component: PowerSettlesDashboardComponent;
  rtSource: RtLmpSource;
  lookbackDays: number;
  requestedDate: string | null;
  defaultDate: string;
  datePolicy: "requested" | "default-yesterday";
  rows: PowerSettlesDashboardIsoRow[];
  summary: {
    isoCount: number;
    completeIsoCount: number;
    partialIsoCount: number;
    missingIsoCount: number;
    hubCount: number;
    completeHubCount: number;
    partialHubCount: number;
    missingHubCount: number;
    unverifiedFallbackHubCount: number;
    latestAsOf: string | null;
  };
}

export function parsePowerIso(raw: string | null): PowerIso {
  if (
    raw === "ercot" ||
    raw === "isone" ||
    raw === "caiso" ||
    raw === "miso" ||
    raw === "spp" ||
    raw === "nyiso"
  ) {
    return raw;
  }
  return "pjm";
}

export function parsePowerProduct(raw: string | null): PowerLmpProduct {
  return raw === "rt" ? "rt" : "da";
}

export function parseRtSource(raw: string | null): RtLmpSource {
  return raw === "verified" ? "verified" : "unverified";
}

export function parsePowerSettlesRtSource(raw: string | null): RtLmpSource {
  return raw === "unverified" ? "unverified" : POWER_SETTLES_DASHBOARD_DEFAULT_RT_SOURCE;
}

export function parsePowerSettlesComponent(raw: string | null): PowerSettlesDashboardComponent {
  if (raw === "energy" || raw === "congestion" || raw === "loss") return raw;
  return "total";
}

export function parseDate(raw: string | null): string | null {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export function defaultPowerSettlesDashboardDate(now = new Date()): string {
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  todayUtc.setUTCDate(todayUtc.getUTCDate() - 1);
  return todayUtc.toISOString().slice(0, 10);
}

export function parsePowerSettlesLookbackDays(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(Math.max(parsed, 1), 14);
}

function parseDateWithFallback(value: string | null, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
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

function isOnPeakHour(iso: PowerIso, hourEnding: number): boolean {
  const window = PEAK_WINDOW_BY_ISO[iso];
  return hourEnding >= window.start && hourEnding <= window.end;
}

function summarizeHub(iso: PowerIso, hub: string, rows: LmpRow[]) {
  const hourly = rows.map((row) => ({
    hourEnding: Number(row.hour_ending),
    datetimeBeginningEpt: row.datetime_beginning_ept,
    total: toNumber(row.total),
    systemEnergy: toNumber(row.system_energy),
    congestion: toNumber(row.congestion),
    marginalLoss: toNumber(row.marginal_loss),
  }));
  const onPeak = hourly.filter((row) => isOnPeakHour(iso, row.hourEnding));
  const offPeak = hourly.filter((row) => !isOnPeakHour(iso, row.hourEnding));
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

function pjmRtTable(rtSource: RtLmpSource) {
  return rtSource === "verified"
    ? {
        sourceTable: "pjm.rt_hrl_lmps",
        currentFilter: "and row_is_current = true",
        energyExpr: "system_energy_price_rt",
      }
    : {
        sourceTable: "pjm.rt_unverified_hrl_lmps",
        currentFilter: "",
        energyExpr: "(total_lmp_rt - congestion_price_rt - marginal_loss_price_rt)",
      };
}

function isoneRtTable(rtSource: RtLmpSource) {
  return rtSource === "verified"
    ? {
        sourceTable: "isone.rt_hrl_lmps_final",
        latestColumn: "date",
        hubColumn: "location_name",
        hubFilter: "and location_type = 'HUB'",
        totalColumn: "locational_marginal_price",
        energyColumn: "energy_component",
        congestionColumn: "congestion_component",
        lossColumn: "marginal_loss_component",
      }
    : {
        sourceTable: "isone.rt_hrl_lmps_prelim",
        latestColumn: "date",
        hubColumn: "location",
        hubFilter: "",
        totalColumn: "lmp",
        energyColumn: "energy",
        congestionColumn: "congestion",
        lossColumn: "loss",
      };
}

function misoRtTable(rtSource: RtLmpSource) {
  return rtSource === "verified"
    ? {
        sourceTable: "miso.rt_lmps_final",
        marketRunId: "RTM",
      }
    : {
        sourceTable: "miso.rt_lmps_prelim",
        marketRunId: "RTM",
      };
}

function sppRtTable(rtSource: RtLmpSource) {
  void rtSource;
  return {
    sourceTable: "spp.rt_lmps_prelim",
    marketRunId: "RTBM",
  };
}

function nyisoRtTable(rtSource: RtLmpSource) {
  void rtSource;
  return {
    sourceTable: "nyiso.rt_lmps_prelim",
    marketRunId: "RTD",
  };
}

function sourceTableFor({
  iso,
  product,
  rtSource,
}: {
  iso: PowerIso;
  product: PowerLmpProduct;
  rtSource: RtLmpSource;
}): string {
  if (product === "da") {
    if (iso === "pjm") return "pjm.da_hrl_lmps";
    if (iso === "ercot") return "ercot.dam_stlmnt_pnt_prices";
    if (iso === "caiso") return "caiso.da_lmps";
    if (iso === "miso") return "miso.da_lmps";
    if (iso === "spp") return "spp.da_lmps";
    if (iso === "nyiso") return "nyiso.da_lmps";
    return "isone.da_hrl_lmps";
  }

  if (iso === "pjm") return pjmRtTable(rtSource).sourceTable;
  if (iso === "ercot") return "ercot.settlement_point_prices";
  if (iso === "caiso") return "caiso.rt_lmps";
  if (iso === "miso") return misoRtTable(rtSource).sourceTable;
  if (iso === "spp") return sppRtTable(rtSource).sourceTable;
  if (iso === "nyiso") return nyisoRtTable(rtSource).sourceTable;
  return isoneRtTable(rtSource).sourceTable;
}

async function latestDate({
  iso,
  product,
  rtSource,
  hubs,
}: {
  iso: PowerIso;
  product: PowerLmpProduct;
  rtSource: RtLmpSource;
  hubs: readonly string[];
}): Promise<string | null> {
  if (iso === "pjm" && product === "da") {
    const rows = await query<{ target_date: string | null }>(
      `
        select max(datetime_beginning_ept::date)::text as target_date
        from pjm.da_hrl_lmps
        where row_is_current = true
          and pnode_name = any($1::text[])
      `,
      [hubs],
    );
    return rows[0]?.target_date ?? null;
  }
  if (iso === "pjm") {
    const rt = pjmRtTable(rtSource);
    const rows = await query<{ target_date: string | null }>(
      `
        select max(datetime_beginning_ept::date)::text as target_date
        from ${rt.sourceTable}
        where pnode_name = any($1::text[])
          ${rt.currentFilter}
      `,
      [hubs],
    );
    return rows[0]?.target_date ?? null;
  }
  if (iso === "ercot" && product === "da") {
    const rows = await query<{ target_date: string | null }>(
      `
        select max(deliverydate)::text as target_date
        from ercot.dam_stlmnt_pnt_prices
        where settlementpoint = any($1::text[])
      `,
      [hubs],
    );
    return rows[0]?.target_date ?? null;
  }
  if (iso === "ercot") {
    const rows = await query<{ target_date: string | null }>(
      `
        select max(deliverydate)::text as target_date
        from ercot.settlement_point_prices
        where settlementpoint = any($1::text[])
      `,
      [hubs],
    );
    return rows[0]?.target_date ?? null;
  }
  if (iso === "caiso") {
    const sourceTable = product === "da" ? "caiso.da_lmps" : "caiso.rt_lmps";
    const marketRunId = product === "da" ? "DAM" : "RTM";
    const rows = await query<{ target_date: string | null }>(
      `
        select max(operating_date)::text as target_date
        from ${sourceTable}
        where node_id = any($1::text[])
          and market_run_id = $2
      `,
      [hubs, marketRunId],
    );
    return rows[0]?.target_date ?? null;
  }
  if (iso === "miso") {
    const rt = misoRtTable(rtSource);
    const sourceTable = product === "da" ? "miso.da_lmps" : rt.sourceTable;
    const marketRunId = product === "da" ? "DAM" : rt.marketRunId;
    const rows = await query<{ target_date: string | null }>(
      `
        select max(operating_date)::text as target_date
        from ${sourceTable}
        where node_id = any($1::text[])
          and market_run_id = $2
      `,
      [hubs, marketRunId],
    );
    return rows[0]?.target_date ?? null;
  }
  if (iso === "spp") {
    const rt = sppRtTable(rtSource);
    const sourceTable = product === "da" ? "spp.da_lmps" : rt.sourceTable;
    const marketRunId = product === "da" ? "DAM" : rt.marketRunId;
    const rows = await query<{ target_date: string | null }>(
      `
        select max(operating_date)::text as target_date
        from ${sourceTable}
        where node_id = any($1::text[])
          and market_run_id = $2
      `,
      [hubs, marketRunId],
    );
    return rows[0]?.target_date ?? null;
  }
  if (iso === "nyiso") {
    const rt = nyisoRtTable(rtSource);
    const sourceTable = product === "da" ? "nyiso.da_lmps" : rt.sourceTable;
    const marketRunId = product === "da" ? "DAM" : rt.marketRunId;
    const rows = await query<{ target_date: string | null }>(
      `
        select max(operating_date)::text as target_date
        from ${sourceTable}
        where node_id = any($1::text[])
          and market_run_id = $2
      `,
      [hubs, marketRunId],
    );
    return rows[0]?.target_date ?? null;
  }
  if (product === "da") {
    const rows = await query<{ target_date: string | null }>(
      `
        select max(date)::text as target_date
        from isone.da_hrl_lmps
        where location_name = any($1::text[])
          and location_type = 'HUB'
      `,
      [hubs],
    );
    return rows[0]?.target_date ?? null;
  }

  const rt = isoneRtTable(rtSource);
  const rows = await query<{ target_date: string | null }>(
    `
      select max(${rt.latestColumn})::text as target_date
      from ${rt.sourceTable}
      where ${rt.hubColumn} = any($1::text[])
        ${rt.hubFilter}
    `,
    [hubs],
  );
  return rows[0]?.target_date ?? null;
}

async function lmpRows({
  iso,
  product,
  rtSource,
  targetDate,
  hubs,
}: {
  iso: PowerIso;
  product: PowerLmpProduct;
  rtSource: RtLmpSource;
  targetDate: string;
  hubs: readonly string[];
}): Promise<LmpRow[]> {
  if (iso === "pjm" && product === "da") {
    return query<LmpRow>(
      `
        select
          to_char(datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
          pnode_name as hub,
          (extract(hour from datetime_beginning_ept)::int + 1) as hour_ending,
          system_energy_price_da as system_energy,
          total_lmp_da as total,
          congestion_price_da as congestion,
          marginal_loss_price_da as marginal_loss,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from pjm.da_hrl_lmps
        where row_is_current = true
          and datetime_beginning_ept::date = $1::date
          and pnode_name = any($2::text[])
        order by array_position($2::text[], pnode_name), datetime_beginning_ept
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "pjm") {
    const rt = pjmRtTable(rtSource);
    return query<LmpRow>(
      `
        select
          to_char(datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
          pnode_name as hub,
          (extract(hour from datetime_beginning_ept)::int + 1) as hour_ending,
          ${rt.energyExpr}::float8 as system_energy,
          total_lmp_rt::float8 as total,
          congestion_price_rt::float8 as congestion,
          marginal_loss_price_rt::float8 as marginal_loss,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ${rt.sourceTable}
        where datetime_beginning_ept::date = $1::date
          and pnode_name = any($2::text[])
          ${rt.currentFilter}
        order by array_position($2::text[], pnode_name), datetime_beginning_ept
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "ercot" && product === "da") {
    return query<LmpRow>(
      `
        select
          to_char(
            deliverydate::timestamp + ((hourending - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          settlementpoint as hub,
          hourending as hour_ending,
          null::double precision as system_energy,
          settlementpointprice as total,
          null::double precision as congestion,
          null::double precision as marginal_loss,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ercot.dam_stlmnt_pnt_prices
        where deliverydate = $1::date
          and settlementpoint = any($2::text[])
        order by array_position($2::text[], settlementpoint), hourending
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "ercot") {
    return query<LmpRow>(
      `
        select
          to_char(
            deliverydate::timestamp + ((deliveryhour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          settlementpoint as hub,
          deliveryhour as hour_ending,
          null::double precision as system_energy,
          avg(settlementpointprice)::float8 as total,
          null::double precision as congestion,
          null::double precision as marginal_loss,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ercot.settlement_point_prices
        where deliverydate = $1::date
          and settlementpoint = any($2::text[])
        group by deliverydate, deliveryhour, settlementpoint
        order by array_position($2::text[], settlementpoint), deliveryhour
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "caiso" && product === "da") {
    return query<LmpRow>(
      `
        select
          to_char(
            operating_date::timestamp + ((operating_hour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          node_id as hub,
          operating_hour as hour_ending,
          energy_component as system_energy,
          locational_marginal_price as total,
          congestion_component as congestion,
          loss_component as marginal_loss,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from caiso.da_lmps
        where operating_date = $1::date
          and node_id = any($2::text[])
          and market_run_id = 'DAM'
        order by array_position($2::text[], node_id), operating_hour
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "caiso") {
    return query<LmpRow>(
      `
        select
          to_char(
            operating_date::timestamp + ((operating_hour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          node_id as hub,
          operating_hour as hour_ending,
          avg(energy_component)::float8 as system_energy,
          avg(locational_marginal_price)::float8 as total,
          avg(congestion_component)::float8 as congestion,
          avg(loss_component)::float8 as marginal_loss,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from caiso.rt_lmps
        where operating_date = $1::date
          and node_id = any($2::text[])
          and market_run_id = 'RTM'
        group by operating_date, operating_hour, node_id
        order by array_position($2::text[], node_id), operating_hour
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "miso" && product === "da") {
    return query<LmpRow>(
      `
        select
          to_char(
            operating_date::timestamp + ((operating_hour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          node_id as hub,
          operating_hour as hour_ending,
          energy_component as system_energy,
          locational_marginal_price as total,
          congestion_component as congestion,
          loss_component as marginal_loss,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from miso.da_lmps
        where operating_date = $1::date
          and node_id = any($2::text[])
          and market_run_id = 'DAM'
        order by array_position($2::text[], node_id), operating_hour
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "miso") {
    const rt = misoRtTable(rtSource);
    return query<LmpRow>(
      `
        select
          to_char(
            operating_date::timestamp + ((operating_hour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          node_id as hub,
          operating_hour as hour_ending,
          avg(energy_component)::float8 as system_energy,
          avg(locational_marginal_price)::float8 as total,
          avg(congestion_component)::float8 as congestion,
          avg(loss_component)::float8 as marginal_loss,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ${rt.sourceTable}
        where operating_date = $1::date
          and node_id = any($2::text[])
          and market_run_id = $3
        group by operating_date, operating_hour, node_id
        order by array_position($2::text[], node_id), operating_hour
      `,
      [targetDate, hubs, rt.marketRunId],
    );
  }
  if (iso === "spp" && product === "da") {
    return query<LmpRow>(
      `
        select
          to_char(
            operating_date::timestamp + ((operating_hour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          node_id as hub,
          operating_hour as hour_ending,
          energy_component as system_energy,
          locational_marginal_price as total,
          congestion_component as congestion,
          loss_component as marginal_loss,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from spp.da_lmps
        where operating_date = $1::date
          and node_id = any($2::text[])
          and market_run_id = 'DAM'
        order by array_position($2::text[], node_id), operating_hour
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "spp") {
    const rt = sppRtTable(rtSource);
    return query<LmpRow>(
      `
        select
          to_char(
            operating_date::timestamp + ((operating_hour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          node_id as hub,
          operating_hour as hour_ending,
          avg(energy_component)::float8 as system_energy,
          avg(locational_marginal_price)::float8 as total,
          avg(congestion_component)::float8 as congestion,
          avg(loss_component)::float8 as marginal_loss,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ${rt.sourceTable}
        where operating_date = $1::date
          and node_id = any($2::text[])
          and market_run_id = $3
        group by operating_date, operating_hour, node_id
        order by array_position($2::text[], node_id), operating_hour
      `,
      [targetDate, hubs, rt.marketRunId],
    );
  }
  if (iso === "nyiso" && product === "da") {
    return query<LmpRow>(
      `
        select
          to_char(
            operating_date::timestamp + ((operating_hour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          node_id as hub,
          operating_hour as hour_ending,
          energy_component as system_energy,
          locational_marginal_price as total,
          congestion_component as congestion,
          loss_component as marginal_loss,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from nyiso.da_lmps
        where operating_date = $1::date
          and node_id = any($2::text[])
          and market_run_id = 'DAM'
        order by array_position($2::text[], node_id), operating_hour
      `,
      [targetDate, hubs],
    );
  }
  if (iso === "nyiso") {
    const rt = nyisoRtTable(rtSource);
    return query<LmpRow>(
      `
        select
          to_char(
            operating_date::timestamp + ((operating_hour - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          node_id as hub,
          operating_hour as hour_ending,
          avg(energy_component)::float8 as system_energy,
          avg(locational_marginal_price)::float8 as total,
          avg(congestion_component)::float8 as congestion,
          avg(loss_component)::float8 as marginal_loss,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ${rt.sourceTable}
        where operating_date = $1::date
          and node_id = any($2::text[])
          and market_run_id = $3
        group by operating_date, operating_hour, node_id
        order by array_position($2::text[], node_id), operating_hour
      `,
      [targetDate, hubs, rt.marketRunId],
    );
  }
  if (product === "da") {
    return query<LmpRow>(
      `
        select
          to_char(
            date::timestamp + ((hour_ending - 1) * interval '1 hour'),
            'YYYY-MM-DD"T"HH24:MI:SS'
          ) as datetime_beginning_ept,
          location_name as hub,
          hour_ending,
          energy_component as system_energy,
          locational_marginal_price as total,
          congestion_component as congestion,
          marginal_loss_component as marginal_loss,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from isone.da_hrl_lmps
        where date = $1::date
          and location_name = any($2::text[])
          and location_type = 'HUB'
        order by array_position($2::text[], location_name), hour_ending
      `,
      [targetDate, hubs],
    );
  }

  const rt = isoneRtTable(rtSource);
  return query<LmpRow>(
    `
      select
        to_char(
          date::timestamp + ((hour_ending - 1) * interval '1 hour'),
          'YYYY-MM-DD"T"HH24:MI:SS'
        ) as datetime_beginning_ept,
        ${rt.hubColumn} as hub,
        hour_ending,
        ${rt.energyColumn} as system_energy,
        ${rt.totalColumn} as total,
        ${rt.congestionColumn} as congestion,
        ${rt.lossColumn} as marginal_loss,
        to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
      from ${rt.sourceTable}
      where date = $1::date
        and ${rt.hubColumn} = any($2::text[])
        ${rt.hubFilter}
      order by array_position($2::text[], ${rt.hubColumn}), hour_ending
    `,
    [targetDate, hubs],
  );
}

export async function buildPowerLmpsPayload({
  iso,
  product,
  rtSource,
  requestedDate,
}: {
  iso: PowerIso;
  product: PowerLmpProduct;
  rtSource: RtLmpSource;
  requestedDate: string | null;
}) {
  const config = ISO_CONFIGS[iso];
  const latest = await latestDate({ iso, product, rtSource, hubs: config.hubs });
  const targetDate = requestedDate ?? latest;
  if (!targetDate) {
    return {
      status: 404,
      payload: { error: `No ${config.label} ${product.toUpperCase()} LMP data is available` },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
      dataAsOf: null,
    };
  }

  const rows = await lmpRows({ iso, product, rtSource, targetDate, hubs: config.hubs });
  const asOf = maxStamp(rows.map((row) => row.as_of));
  const source = sourceTableFor({ iso, product, rtSource });

  return {
    payload: {
      iso,
      isoLabel: config.label,
      defaultHub: config.defaultHub,
      supportsComponents: config.supportsComponents,
      targetDate,
      latestDate: latest,
      asOf,
      source,
      rtSource: product === "rt" ? rtSource : undefined,
      hubs: config.hubs.map((hub) =>
        summarizeHub(
          iso,
          hub,
          rows.filter((row) => row.hub === hub),
        ),
      ),
    },
    rowCount: rows.length,
    dataAsOf: asOf,
  };
}

function componentExpr({
  iso,
  market,
  component,
  prefix,
  rtSource,
}: {
  iso: PowerIso;
  market: PowerLmpProduct;
  component: ComponentKey;
  prefix: string;
  rtSource: RtLmpSource;
}): string {
  if (iso === "ercot") return `${prefix}.price`;
  if (iso === "caiso" || iso === "miso" || iso === "spp" || iso === "nyiso") {
    if (component === "energy") return `${prefix}.energy_component`;
    if (component === "congestion") return `${prefix}.congestion_component`;
    if (component === "loss") return `${prefix}.loss_component`;
    return `${prefix}.locational_marginal_price`;
  }
  if (iso === "pjm") {
    const suffix = market === "da" ? "da" : "rt";
    if (market === "rt" && component === "energy") {
      return rtSource === "verified"
        ? `${prefix}.system_energy_price_rt`
        : `(${prefix}.total_lmp_rt - ${prefix}.congestion_price_rt - ${prefix}.marginal_loss_price_rt)`;
    }
    if (component === "energy") return `${prefix}.system_energy_price_${suffix}`;
    if (component === "congestion") return `${prefix}.congestion_price_${suffix}`;
    if (component === "loss") return `${prefix}.marginal_loss_price_${suffix}`;
    return `${prefix}.total_lmp_${suffix}`;
  }
  if (market === "rt" && rtSource === "unverified") {
    if (component === "energy") return `${prefix}.energy`;
    if (component === "congestion") return `${prefix}.congestion`;
    if (component === "loss") return `${prefix}.loss`;
    return `${prefix}.lmp`;
  }
  if (component === "energy") return `${prefix}.energy_component`;
  if (component === "congestion") return `${prefix}.congestion_component`;
  if (component === "loss") return `${prefix}.marginal_loss_component`;
  return `${prefix}.locational_marginal_price`;
}

async function settleRows({
  iso,
  market,
  rtSource,
  startDate,
  endDate,
  hub,
  component,
}: {
  iso: PowerIso;
  market: PowerLmpProduct;
  rtSource: RtLmpSource;
  startDate: string;
  endDate: string;
  hub: string;
  component: ComponentKey;
}): Promise<HourRow[]> {
  if (iso === "pjm" && market === "da") {
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          datetime_beginning_ept::date::text as market_date,
          (extract(hour from datetime_beginning_ept)::int + 1) as hour_ending,
          ${value}::float8 as value,
          to_char(max(updated_at) over (partition by datetime_beginning_ept::date), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from pjm.da_hrl_lmps as lmps
        where row_is_current = true
          and pnode_name = $1
          and datetime_beginning_ept::date between $2::date and $3::date
        order by datetime_beginning_ept
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "pjm") {
    const rt = pjmRtTable(rtSource);
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          datetime_beginning_ept::date::text as market_date,
          (extract(hour from datetime_beginning_ept)::int + 1) as hour_ending,
          ${value}::float8 as value,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ${rt.sourceTable} as lmps
        where pnode_name = $1
          and datetime_beginning_ept::date between $2::date and $3::date
          ${rt.currentFilter}
        order by datetime_beginning_ept::date, extract(hour from datetime_beginning_ept)
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "ercot" && market === "da") {
    return query<HourRow>(
      `
        select
          deliverydate::text as market_date,
          hourending as hour_ending,
          settlementpointprice::float8 as value,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ercot.dam_stlmnt_pnt_prices
        where settlementpoint = $1
          and deliverydate between $2::date and $3::date
        order by deliverydate, hourending
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "ercot") {
    return query<HourRow>(
      `
        select
          deliverydate::text as market_date,
          deliveryhour as hour_ending,
          avg(settlementpointprice)::float8 as value,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ercot.settlement_point_prices
        where settlementpoint = $1
          and deliverydate between $2::date and $3::date
        group by deliverydate, deliveryhour
        order by deliverydate, deliveryhour
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "caiso" && market === "da") {
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          operating_date::text as market_date,
          operating_hour as hour_ending,
          ${value}::float8 as value,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from caiso.da_lmps as lmps
        where node_id = $1
          and operating_date between $2::date and $3::date
          and market_run_id = 'DAM'
        order by operating_date, operating_hour
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "caiso") {
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          operating_date::text as market_date,
          operating_hour as hour_ending,
          avg(${value})::float8 as value,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from caiso.rt_lmps as lmps
        where node_id = $1
          and operating_date between $2::date and $3::date
          and market_run_id = 'RTM'
        group by operating_date, operating_hour
        order by operating_date, operating_hour
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "miso" && market === "da") {
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          operating_date::text as market_date,
          operating_hour as hour_ending,
          ${value}::float8 as value,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from miso.da_lmps as lmps
        where node_id = $1
          and operating_date between $2::date and $3::date
          and market_run_id = 'DAM'
        order by operating_date, operating_hour
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "miso") {
    const rt = misoRtTable(rtSource);
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          operating_date::text as market_date,
          operating_hour as hour_ending,
          avg(${value})::float8 as value,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ${rt.sourceTable} as lmps
        where node_id = $1
          and operating_date between $2::date and $3::date
          and market_run_id = $4
        group by operating_date, operating_hour
        order by operating_date, operating_hour
      `,
      [hub, startDate, endDate, rt.marketRunId],
    );
  }
  if (iso === "spp" && market === "da") {
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          operating_date::text as market_date,
          operating_hour as hour_ending,
          ${value}::float8 as value,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from spp.da_lmps as lmps
        where node_id = $1
          and operating_date between $2::date and $3::date
          and market_run_id = 'DAM'
        order by operating_date, operating_hour
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "spp") {
    const rt = sppRtTable(rtSource);
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          operating_date::text as market_date,
          operating_hour as hour_ending,
          avg(${value})::float8 as value,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ${rt.sourceTable} as lmps
        where node_id = $1
          and operating_date between $2::date and $3::date
          and market_run_id = $4
        group by operating_date, operating_hour
        order by operating_date, operating_hour
      `,
      [hub, startDate, endDate, rt.marketRunId],
    );
  }
  if (iso === "nyiso" && market === "da") {
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          operating_date::text as market_date,
          operating_hour as hour_ending,
          ${value}::float8 as value,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from nyiso.da_lmps as lmps
        where node_id = $1
          and operating_date between $2::date and $3::date
          and market_run_id = 'DAM'
        order by operating_date, operating_hour
      `,
      [hub, startDate, endDate],
    );
  }
  if (iso === "nyiso") {
    const rt = nyisoRtTable(rtSource);
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          operating_date::text as market_date,
          operating_hour as hour_ending,
          avg(${value})::float8 as value,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from ${rt.sourceTable} as lmps
        where node_id = $1
          and operating_date between $2::date and $3::date
          and market_run_id = $4
        group by operating_date, operating_hour
        order by operating_date, operating_hour
      `,
      [hub, startDate, endDate, rt.marketRunId],
    );
  }
  if (market === "da") {
    const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
    return query<HourRow>(
      `
        select
          date::text as market_date,
          hour_ending,
          ${value}::float8 as value,
          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
        from isone.da_hrl_lmps as lmps
        where location_name = $1
          and location_type = 'HUB'
          and date between $2::date and $3::date
        order by date, hour_ending
      `,
      [hub, startDate, endDate],
    );
  }
  const rt = isoneRtTable(rtSource);
  const value = componentExpr({ iso, market, component, prefix: "lmps", rtSource });
  return query<HourRow>(
    `
      select
        date::text as market_date,
        hour_ending,
        ${value}::float8 as value,
        to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
      from ${rt.sourceTable} as lmps
      where ${rt.hubColumn} = $1
        ${rt.hubFilter}
        and date between $2::date and $3::date
      order by date, hour_ending
    `,
    [hub, startDate, endDate],
  );
}

function productSummary(
  iso: PowerIso,
  values: Array<number | null>,
): PowerSettlesDashboardProductSummary {
  const observed = values.filter((value): value is number => value !== null);
  const onPeakValues = values.filter((_, index) => isOnPeakHour(iso, index + 1));
  const offPeakValues = values.filter((_, index) => !isOnPeakHour(iso, index + 1));
  let peakHour: number | null = null;
  let peakPrice: number | null = null;

  values.forEach((value, index) => {
    if (value === null) return;
    if (peakPrice === null || value > peakPrice) {
      peakPrice = value;
      peakHour = index + 1;
    }
  });

  return {
    flatAvg: avg(values),
    onPeakAvg: avg(onPeakValues),
    offPeakAvg: avg(offPeakValues),
    peakHour,
    peakPrice,
    observationCount: observed.length,
  };
}

function dashboardComponentValue(
  row: LmpRow,
  component: PowerSettlesDashboardComponent,
): number | null {
  if (component === "energy") return toNumber(row.system_energy);
  if (component === "congestion") return toNumber(row.congestion);
  if (component === "loss") return toNumber(row.marginal_loss);
  return toNumber(row.total);
}

function dashboardHourlyValuesByHub({
  rows,
  hubs,
  component,
}: {
  rows: LmpRow[];
  hubs: readonly string[];
  component: PowerSettlesDashboardComponent;
}): Map<string, HourlyValueSet> {
  const byHub = new Map<string, HourlyValueSet>();
  for (const hub of hubs) {
    byHub.set(hub, { values: emptyHours(), asOf: null });
  }

  for (const row of rows) {
    const hub = row.hub;
    const item = byHub.get(hub);
    if (!item) continue;
    const hourIndex = Number(row.hour_ending) - 1;
    if (hourIndex >= 0 && hourIndex < 24) {
      item.values[hourIndex] = dashboardComponentValue(row, component);
    }
    item.asOf = maxStamp([item.asOf, row.as_of]);
  }

  return byHub;
}

function subtractHourlyValues(
  left: Array<number | null>,
  right: Array<number | null>,
): Array<number | null> {
  return left.map((value, index) => {
    const compareValue = right[index] ?? null;
    return value === null || compareValue === null ? null : value - compareValue;
  });
}

function emptyProductSummary(): PowerSettlesDashboardProductSummary {
  return {
    flatAvg: null,
    onPeakAvg: null,
    offPeakAvg: null,
    peakHour: null,
    peakPrice: null,
    observationCount: 0,
  };
}

function normalizeDashboardComponentForIso(
  iso: PowerIso,
  component: PowerSettlesDashboardComponent,
): PowerSettlesDashboardComponent {
  return ISO_CONFIGS[iso].supportsComponents ? component : "total";
}

function dashboardStatus({
  targetDate,
  da,
  rt,
}: {
  targetDate: string | null;
  da: PowerSettlesDashboardProductSummary;
  rt: PowerSettlesDashboardProductSummary;
}): { status: PowerSettlesDashboardStatus; detail: string } {
  if (!targetDate) {
    return { status: "missing", detail: "No DA/RT date is available for the default hub." };
  }
  if (da.observationCount === 0 && rt.observationCount === 0) {
    return { status: "missing", detail: "No DA or RT hourly values were returned for the selected date." };
  }
  if (da.observationCount < 24 || rt.observationCount < 24) {
    return {
      status: "partial",
      detail: `DA ${da.observationCount}/24 hours, RT ${rt.observationCount}/24 hours.`,
    };
  }
  return { status: "ok", detail: "DA and RT both returned 24 hourly values." };
}

function powerSettlesDetailUrl({
  iso,
  targetDate,
  hub,
  rtSource,
  component,
}: {
  iso: PowerIso;
  targetDate: string | null;
  hub: string;
  rtSource: RtLmpSource;
  component: PowerSettlesDashboardComponent;
}): string | null {
  if (!targetDate) return null;
  const params = new URLSearchParams({
    section: "pjm-da-lmps",
    iso,
    view: "daily-settles",
    product: "dart",
    date: targetDate,
    hub,
    source: rtSource,
    component,
    refresh: "1",
  });
  return `/?${params.toString()}`;
}

function dashboardRtSourceStatus({
  iso,
  requestedRtSource,
  effectiveRtSource,
}: {
  iso: PowerIso;
  requestedRtSource: RtLmpSource;
  effectiveRtSource: RtLmpSource;
}): PowerSettlesDashboardRtSourceStatus {
  if (iso === "ercot" || iso === "caiso" || iso === "spp") {
    return "single-source";
  }
  if (requestedRtSource === "verified" && effectiveRtSource === "unverified") return "fallback";
  return "requested";
}

async function buildPowerSettlesDashboardIsoRows({
  iso,
  requestedDate,
  rtSource,
  component,
  defaultDate,
}: {
  iso: PowerIso;
  requestedDate: string | null;
  rtSource: RtLmpSource;
  component: PowerSettlesDashboardComponent;
  defaultDate: string;
}): Promise<PowerSettlesDashboardIsoRow[]> {
  const config = ISO_CONFIGS[iso];
  const hubs = config.dashboardHubs;
  const effectiveComponent = normalizeDashboardComponentForIso(iso, component);
  const targetDate = requestedDate ?? defaultDate;
  const [latestDaDate, latestRtDate] = await Promise.all([
    latestDate({ iso, product: "da", rtSource, hubs }),
    latestDate({ iso, product: "rt", rtSource, hubs }),
  ]);

  if (!targetDate) {
    return hubs.map((hub) => ({
      iso,
      isoLabel: config.label,
      hub,
      effectiveComponent,
      effectiveRtSource:
        iso === "ercot" || iso === "caiso" || iso === "spp"
          ? "unverified"
          : rtSource,
      rtSourceStatus: dashboardRtSourceStatus({
        iso,
        requestedRtSource: rtSource,
        effectiveRtSource:
          iso === "ercot" || iso === "caiso" || iso === "spp"
            ? "unverified"
            : rtSource,
      }),
      targetDate: null,
      latestDaDate,
      latestRtDate,
      daAsOf: null,
      rtAsOf: null,
      dataAsOf: null,
      sourceTables: {
        da: sourceTableFor({ iso, product: "da", rtSource }),
        rt: sourceTableFor({ iso, product: "rt", rtSource }),
      },
      status: "missing",
      statusDetail: "No latest DA/RT date could be resolved for the dashboard hub.",
      detailUrl: null,
      products: {
        da: emptyProductSummary(),
        rt: emptyProductSummary(),
        dart: emptyProductSummary(),
      },
    }));
  }

  const [daRows, requestedRtRows] = await Promise.all([
    lmpRows({
      iso,
      product: "da",
      rtSource,
      targetDate,
      hubs,
    }),
    lmpRows({
      iso,
      product: "rt",
      rtSource,
      targetDate,
      hubs,
    }),
  ]);
  const daByHub = dashboardHourlyValuesByHub({
    rows: daRows,
    hubs,
    component: effectiveComponent,
  });
  const requestedRtByHub = dashboardHourlyValuesByHub({
    rows: requestedRtRows,
    hubs,
    component: effectiveComponent,
  });

  let fallbackRtByHub: Map<string, HourlyValueSet> | null = null;
  let fallbackLatestRtDate: string | null = null;
  const canFallbackToUnverified =
    rtSource === "verified" && (iso === "pjm" || iso === "isone");
  if (canFallbackToUnverified) {
    const needsFallback = hubs.some((hub) => {
      const requestedRt = requestedRtByHub.get(hub) ?? { values: emptyHours(), asOf: null };
      return productSummary(iso, requestedRt.values).observationCount < 24;
    });

    if (needsFallback) {
      const [fallbackRtRows, nextFallbackLatestRtDate] = await Promise.all([
        lmpRows({
          iso,
          product: "rt",
          rtSource: "unverified",
          targetDate,
          hubs,
        }),
        latestDate({ iso, product: "rt", rtSource: "unverified", hubs }),
      ]);
      fallbackRtByHub = dashboardHourlyValuesByHub({
        rows: fallbackRtRows,
        hubs,
        component: effectiveComponent,
      });
      fallbackLatestRtDate = nextFallbackLatestRtDate;
    }
  }

  return hubs.map((hub) => {
    const targetDa = daByHub.get(hub) ?? { values: emptyHours(), asOf: null };
    const requestedRt = requestedRtByHub.get(hub) ?? { values: emptyHours(), asOf: null };
    const requestedRtSummary = productSummary(iso, requestedRt.values);
    const fallbackRt = fallbackRtByHub?.get(hub) ?? null;
    const fallbackRtSummary = fallbackRt ? productSummary(iso, fallbackRt.values) : null;
    const useFallback =
      fallbackRt !== null &&
      fallbackRtSummary !== null &&
      fallbackRtSummary.observationCount > requestedRtSummary.observationCount;
    const targetRt: HourlyValueSet = useFallback && fallbackRt ? fallbackRt : requestedRt;
    const effectiveRtSource: RtLmpSource =
      iso === "ercot" || iso === "caiso" || iso === "spp" || useFallback
        ? "unverified"
        : rtSource;
    const rt = useFallback && fallbackRtSummary ? fallbackRtSummary : requestedRtSummary;
    const da = productSummary(iso, targetDa.values);
    const dart = productSummary(iso, subtractHourlyValues(targetDa.values, targetRt.values));
    const { status, detail } = dashboardStatus({ targetDate, da, rt });
    const dataAsOf = maxStamp([targetDa.asOf, targetRt.asOf]);
    const rtSourceStatus = dashboardRtSourceStatus({
      iso,
      requestedRtSource: rtSource,
      effectiveRtSource,
    });
    const statusDetail =
      rtSourceStatus === "fallback"
        ? `${detail} Verified RT was unavailable or less complete for this hub, so unverified RT is shown.`
        : detail;

    return {
      iso,
      isoLabel: config.label,
      hub,
      effectiveComponent,
      effectiveRtSource,
      rtSourceStatus,
      targetDate,
      latestDaDate,
      latestRtDate: useFallback ? fallbackLatestRtDate : latestRtDate,
      daAsOf: targetDa.asOf,
      rtAsOf: targetRt.asOf,
      dataAsOf,
      sourceTables: {
        da: sourceTableFor({ iso, product: "da", rtSource }),
        rt: sourceTableFor({ iso, product: "rt", rtSource: effectiveRtSource }),
      },
      status,
      statusDetail,
      detailUrl: powerSettlesDetailUrl({
        iso,
        targetDate,
        hub,
        rtSource: effectiveRtSource,
        component: effectiveComponent,
      }),
      products: {
        da,
        rt,
        dart,
      },
    };
  });
}

export async function buildPowerSettlesDashboardPayload({
  requestedDate,
  lookbackDays,
  rtSource,
  component,
}: {
  requestedDate: string | null;
  lookbackDays: number;
  rtSource: RtLmpSource;
  component: PowerSettlesDashboardComponent;
}) {
  const normalizedLookbackDays = Number.isFinite(lookbackDays) ? Math.trunc(lookbackDays) : 7;
  const boundedLookbackDays = Math.min(Math.max(normalizedLookbackDays, 1), 14);
  const defaultDate = defaultPowerSettlesDashboardDate();
  const rows = (
    await Promise.all(
      POWER_SETTLES_DASHBOARD_ISOS.map((iso) =>
        buildPowerSettlesDashboardIsoRows({
          iso,
          requestedDate,
          rtSource,
          component,
          defaultDate,
        }),
      ),
    )
  ).flat();
  const isoStatuses = POWER_SETTLES_DASHBOARD_ISOS.map((iso) => {
    const isoRows = rows.filter((row) => row.iso === iso);
    if (isoRows.length > 0 && isoRows.every((row) => row.status === "ok")) return "ok";
    if (isoRows.some((row) => row.status !== "missing")) return "partial";
    return "missing";
  });
  const latestAsOf = maxStamp(rows.map((row) => row.dataAsOf));
  const payload: PowerSettlesDashboardPayload = {
    component,
    rtSource,
    lookbackDays: boundedLookbackDays,
    requestedDate,
    defaultDate,
    datePolicy: requestedDate ? "requested" : "default-yesterday",
    rows,
    summary: {
      isoCount: POWER_SETTLES_DASHBOARD_ISOS.length,
      completeIsoCount: isoStatuses.filter((status) => status === "ok").length,
      partialIsoCount: isoStatuses.filter((status) => status === "partial").length,
      missingIsoCount: isoStatuses.filter((status) => status === "missing").length,
      hubCount: rows.length,
      completeHubCount: rows.filter((row) => row.status === "ok").length,
      partialHubCount: rows.filter((row) => row.status === "partial").length,
      missingHubCount: rows.filter((row) => row.status === "missing").length,
      unverifiedFallbackHubCount: rows.filter((row) => row.rtSourceStatus === "fallback").length,
      latestAsOf,
    },
  };

  return {
    payload,
    rowCount: rows.length,
    dataAsOf: latestAsOf,
  };
}

export async function buildPowerLmpSettlesPayload({
  iso,
  start,
  end,
  hub,
  component,
  rtSource,
}: {
  iso: PowerIso;
  start: string | null;
  end: string | null;
  hub: string | null;
  component: ComponentKey;
  rtSource: RtLmpSource;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const startDate = parseDateWithFallback(start, today);
  const endDate = parseDateWithFallback(end, startDate);
  const config = ISO_CONFIGS[iso];
  const selectedHub = hub && config.hubs.includes(hub) ? hub : config.defaultHub;
  const selectedComponent = config.supportsComponents ? component : "total";
  const dayCount = inclusiveDayCount(startDate, endDate);

  if (dayCount < 1) {
    return {
      status: 400,
      payload: { error: "end must be on or after start" },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
      dataAsOf: null,
    };
  }

  const [daRows, rtRows] = await Promise.all([
    settleRows({
      iso,
      market: "da",
      rtSource,
      startDate,
      endDate,
      hub: selectedHub,
      component: selectedComponent,
    }),
    settleRows({
      iso,
      market: "rt",
      rtSource,
      startDate,
      endDate,
      hub: selectedHub,
      component: selectedComponent,
    }),
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
      hub: selectedHub,
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
      iso,
      isoLabel: config.label,
      startDate,
      endDate,
      hub: selectedHub,
      component: selectedComponent,
      rtSource,
      rowCount: rows.length,
      summary: {
        rowCount: rows.length,
        latestDate: rows.at(-1)?.date ?? null,
        latestAsOf,
      },
      rows,
    },
    rowCount: rows.length,
    dataAsOf: latestAsOf,
  };
}
