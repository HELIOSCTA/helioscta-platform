"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import ControlCard from "@/components/dashboard/ControlCard";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

type PowerIso = "pjm" | "ercot" | "isone" | "caiso";
type RtLmpSource = "verified" | "unverified";
type PowerSettlesComponent = "total" | "energy" | "congestion" | "loss";
type DashboardStatus = "ok" | "partial" | "missing";
type RtSourceStatus = "requested" | "fallback" | "single-source";

interface ProductSummary {
  flatAvg: number | null;
  onPeakAvg: number | null;
  offPeakAvg: number | null;
  peakHour: number | null;
  peakPrice: number | null;
  observationCount: number;
}

interface DashboardIsoRow {
  iso: PowerIso;
  isoLabel: string;
  hub: string;
  effectiveComponent: PowerSettlesComponent;
  effectiveRtSource: RtLmpSource;
  rtSourceStatus: RtSourceStatus;
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
  status: DashboardStatus;
  statusDetail: string;
  detailUrl: string | null;
  products: {
    da: ProductSummary;
    rt: ProductSummary;
    dart: ProductSummary;
  };
}

interface PowerSettlesDashboardPayload {
  component: PowerSettlesComponent;
  rtSource: RtLmpSource;
  lookbackDays: number;
  requestedDate: string | null;
  defaultDate: string;
  datePolicy: "requested" | "default-yesterday";
  rows: DashboardIsoRow[];
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

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const COMPONENT_TABS: Array<{ value: PowerSettlesComponent; label: string }> = [
  { value: "total", label: "Total" },
  { value: "energy", label: "Energy" },
  { value: "congestion", label: "Congestion" },
  { value: "loss", label: "Loss" },
];
const MAIN_HUB_ORDER: PowerIso[] = ["pjm", "ercot", "isone", "caiso"];
const MAIN_HUB_BY_ISO: Record<PowerIso, string> = {
  pjm: "WESTERN HUB",
  ercot: "HB_NORTH",
  isone: ".H.INTERNAL_HUB",
  caiso: "TH_SP15_GEN-APND",
};

function buildApiUrl({
  date,
  lookbackDays,
  rtSource,
  component,
  refresh,
}: {
  date: string | null;
  lookbackDays: number;
  rtSource: RtLmpSource;
  component: PowerSettlesComponent;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({
    lookbackDays: String(lookbackDays),
    rtSource,
    component,
  });
  if (date) params.set("date", date);
  if (refresh) params.set("refresh", "1");
  return `/api/power-settles-dashboard?${params.toString()}`;
}

function buildCacheKey({
  date,
  lookbackDays,
  rtSource,
  component,
}: {
  date: string | null;
  lookbackDays: number;
  rtSource: RtLmpSource;
  component: PowerSettlesComponent;
}): string {
  return [
    "api:power-settles-dashboard",
    date ?? "default-yesterday",
    lookbackDays,
    rtSource,
    component,
  ].join(":");
}

function parseInitialRtSource(value: string | null): RtLmpSource {
  return value === "unverified" ? "unverified" : "verified";
}

function parseInitialLookbackDays(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(Math.max(parsed, 1), 14);
}

function parseInitialComponent(value: string | null): PowerSettlesComponent {
  if (value === "energy" || value === "congestion" || value === "loss") return value;
  return "total";
}

function parseInitialDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function fmtPrice(value: number | null, signed = false): string {
  if (value === null || !Number.isFinite(value)) return "-";
  const sign = value < 0 ? "-" : signed && value > 0 ? "+" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function fmtStamp(value: string | null): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function fmtDate(value: string | null): string {
  return value ?? "-";
}

function statusClass(status: DashboardStatus): string {
  if (status === "ok") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "partial") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-red-500/30 bg-red-500/10 text-red-200";
}

function statusLabel(status: DashboardStatus): string {
  if (status === "ok") return "Complete";
  if (status === "partial") return "Partial";
  return "Missing";
}

function dartClass(value: number | null): string {
  if (value === null) return "text-gray-500";
  if (value > 0) return "text-emerald-200";
  if (value < 0) return "text-red-200";
  return "text-gray-200";
}

function metricCell(value: number | null, signed = false) {
  return (
    <span className={`tabular-nums ${signed ? dartClass(value) : "text-gray-200"}`}>
      {fmtPrice(value, signed)}
    </span>
  );
}

function FilterPills<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </span>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
              active
                ? "border-sky-500/55 bg-sky-500/15 text-sky-100"
                : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function metricTriplet(
  row: DashboardIsoRow,
  period: "onPeak" | "offPeak",
  withDivider = false,
) {
  const da = period === "onPeak" ? row.products.da.onPeakAvg : row.products.da.offPeakAvg;
  const rt = period === "onPeak" ? row.products.rt.onPeakAvg : row.products.rt.offPeakAvg;
  const dart =
    period === "onPeak" ? row.products.dart.onPeakAvg : row.products.dart.offPeakAvg;
  const label = period === "onPeak" ? "OnPk" : "OffPeak";

  return (
    <span
      className={`inline-grid w-full grid-cols-3 items-center gap-1 tabular-nums ${
        withDivider ? "border-l border-gray-800 pl-2" : ""
      }`}
      title={`${label} DA ${fmtPrice(da)} | RT ${fmtPrice(rt)} | DART ${fmtPrice(dart, true)}`}
    >
      <span className="text-right">{metricCell(da)}</span>
      <span className="text-right">{metricCell(rt)}</span>
      <span className="text-right">{metricCell(dart, true)}</span>
    </span>
  );
}

function metricTripletHeader(label: string, withDivider = false) {
  return (
    <span
      className={`inline-grid w-full grid-cols-3 items-center gap-1 ${
        withDivider ? "border-l border-gray-800 pl-2" : ""
      }`}
    >
      <span className="col-span-3 text-center text-[10px] normal-case">{label}</span>
      <span className="text-right text-[9px] text-gray-700">DA</span>
      <span className="text-right text-[9px] text-gray-700">RT</span>
      <span className="text-right text-[9px] text-gray-700">DART</span>
    </span>
  );
}

function sourceBadge(row: DashboardIsoRow) {
  if (row.rtSourceStatus === "fallback") {
    return {
      label: "Unverified RT",
      className: "border-amber-500/35 bg-amber-500/10 text-amber-200",
      title: "Verified RT was unavailable or less complete, so this hub uses unverified RT.",
    };
  }
  if (row.rtSourceStatus === "single-source") {
    return {
      label: row.iso === "ercot" ? "Settlement RT" : "Five-Min RT",
      className: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
      title: "This ISO uses the single promoted RT source available in the LMP page.",
    };
  }
  if (row.effectiveRtSource === "verified") {
    return {
      label: "Verified RT",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      title: "This hub uses verified RT data.",
    };
  }
  return {
    label: "Unverified RT",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-200",
    title: "This hub uses unverified RT data.",
  };
}

function isoStatus(rows: DashboardIsoRow[]): DashboardStatus {
  if (rows.length > 0 && rows.every((row) => row.status === "ok")) return "ok";
  if (rows.some((row) => row.status !== "missing")) return "partial";
  return "missing";
}

function IsoSummaryCard({
  isoLabel,
  rows,
  requestedComponent,
}: {
  isoLabel: string;
  rows: DashboardIsoRow[];
  requestedComponent: PowerSettlesComponent;
}) {
  const status = isoStatus(rows);
  const fallbackComponent = rows.some((row) => row.effectiveComponent !== requestedComponent);
  const fallbackSourceCount = rows.filter((row) => row.rtSourceStatus === "fallback").length;
  const latestAsOf = fmtStamp(
    rows
      .map((row) => row.dataAsOf)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null,
  );
  const targetDate = fmtDate(rows[0]?.targetDate ?? null);

  return (
    <article className="w-full max-w-[620px] overflow-hidden rounded-lg border border-gray-800 bg-[#0d1119] shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 bg-gray-950/30 px-2.5 py-1.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-100">{isoLabel}</h3>
            <span className="text-[11px] text-gray-600">
              {rows.length} {rows.length === 1 ? "hub" : "hubs"}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-gray-500">
            {targetDate} / as of {latestAsOf}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <span
            className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusClass(status)}`}
          >
            {statusLabel(status)}
          </span>
          {fallbackSourceCount > 0 && (
            <span
              className="inline-flex rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200"
              title={`${fallbackSourceCount} hub${fallbackSourceCount === 1 ? "" : "s"} use unverified RT fallback.`}
            >
              {fallbackSourceCount} Fallback
            </span>
          )}
          {fallbackComponent && (
            <span className="inline-flex rounded-md border border-gray-700 bg-gray-950/70 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
              Total
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[598px] px-2.5 py-1.5 text-xs">
          <div className="grid grid-cols-[118px_94px_42px_160px_160px] items-center gap-1.5 border-b border-gray-800/80 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            <span>Hub</span>
            <span>Source</span>
            <span className="text-right">LMPs</span>
            {metricTripletHeader("OnPk", true)}
            {metricTripletHeader("OffPeak", true)}
          </div>
          <div className="divide-y divide-gray-800/70">
            {rows.map((row) => {
              const badge = sourceBadge(row);
              return (
                <div
                  key={`${row.iso}-${row.hub}`}
                  className="grid grid-cols-[118px_94px_42px_160px_160px] items-center gap-1.5 py-1"
                  title={row.statusDetail}
                >
                  <span className="truncate font-semibold text-gray-300" title={row.hub}>
                    {row.hub}
                  </span>
                  <span
                    className={`w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}
                    title={badge.title}
                  >
                    {badge.label}
                  </span>
                  <span className="text-right">
                    {row.detailUrl ? (
                      <a
                        href={row.detailUrl}
                        className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[10px] font-semibold text-gray-300 transition-colors hover:border-sky-500/50 hover:bg-gray-700 hover:text-white"
                      >
                        LMPs
                      </a>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </span>
                  <span className="text-right">{metricTriplet(row, "onPeak", true)}</span>
                  <span className="text-right">{metricTriplet(row, "offPeak", true)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}

function MainHubSummary({ rows }: { rows: DashboardIsoRow[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-gray-800 bg-[#0d1119] shadow-xl shadow-black/20">
      <div className="flex items-center justify-between gap-2 border-b border-gray-800 bg-gray-950/30 px-2.5 py-1.5">
        <div>
          <h3 className="text-sm font-semibold text-gray-100">Main Hubs</h3>
          <div className="mt-0.5 text-[11px] text-gray-500">One hub per ISO</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[828px] px-2.5 py-1.5 text-xs">
          <div className="grid grid-cols-[58px_138px_96px_72px_42px_160px_160px] items-center gap-1.5 border-b border-gray-800/80 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            <span>ISO</span>
            <span>Hub</span>
            <span>Source</span>
            <span>Status</span>
            <span className="text-right">LMPs</span>
            {metricTripletHeader("OnPk", true)}
            {metricTripletHeader("OffPeak", true)}
          </div>
          <div className="divide-y divide-gray-800/70">
            {rows.map((row) => {
              const badge = sourceBadge(row);
              return (
                <div
                  key={`main-${row.iso}-${row.hub}`}
                  className="grid grid-cols-[58px_138px_96px_72px_42px_160px_160px] items-center gap-1.5 py-1"
                  title={row.statusDetail}
                >
                  <span className="font-semibold text-gray-100">{row.isoLabel}</span>
                  <span className="truncate font-semibold text-gray-300" title={row.hub}>
                    {row.hub}
                  </span>
                  <span
                    className={`w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}
                    title={badge.title}
                  >
                    {badge.label}
                  </span>
                  <span
                    className={`w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${statusClass(row.status)}`}
                  >
                    {statusLabel(row.status)}
                  </span>
                  <span className="text-right">
                    {row.detailUrl ? (
                      <a
                        href={row.detailUrl}
                        className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[10px] font-semibold text-gray-300 transition-colors hover:border-sky-500/50 hover:bg-gray-700 hover:text-white"
                      >
                        LMPs
                      </a>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </span>
                  <span className="text-right">{metricTriplet(row, "onPeak", true)}</span>
                  <span className="text-right">{metricTriplet(row, "offPeak", true)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function PowerSettlesDashboard() {
  const searchParams = useSearchParams();
  const initialDate = parseInitialDate(searchParams.get("date"));
  const [rtSource] = useState<RtLmpSource>(() =>
    parseInitialRtSource(searchParams.get("rtSource")),
  );
  const [component, setComponent] = useState<PowerSettlesComponent>(() =>
    parseInitialComponent(searchParams.get("component")),
  );
  const [lookbackDays] = useState(() =>
    parseInitialLookbackDays(searchParams.get("lookbackDays")),
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(() => initialDate);
  const [dateInput, setDateInput] = useState(() => initialDate ?? "");
  const [refreshToken, setRefreshToken] = useState(() =>
    searchParams.get("refresh") === "1" ? 1 : 0,
  );
  const [data, setData] = useState<PowerSettlesDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const forceRefresh = refreshToken > 0;
  const apiUrl = useMemo(
    () =>
      buildApiUrl({
        date: selectedDate,
        lookbackDays,
        rtSource,
        component,
        refresh: forceRefresh,
      }),
    [component, forceRefresh, lookbackDays, rtSource, selectedDate],
  );
  const cacheKey = useMemo(
    () =>
      buildCacheKey({
        date: selectedDate,
        lookbackDays,
        rtSource,
        component,
      }),
    [component, lookbackDays, rtSource, selectedDate],
  );

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchJsonWithCache<PowerSettlesDashboardPayload>({
      key: cacheKey,
      url: apiUrl,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
    })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
      })
      .catch((nextError) => {
        if (cancelled) return;
        if (nextError instanceof Error && nextError.name === "AbortError") return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load Power Settles.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiUrl, cacheKey, forceRefresh, refreshToken]);

  const componentFallbackApplies =
    data?.rows.some((row) => row.effectiveComponent !== data.component) ?? false;
  const isoCards = useMemo(() => {
    if (!data) return [];
    const groups: Array<{ iso: PowerIso; isoLabel: string; rows: DashboardIsoRow[] }> = [];
    const byIso = new Map<PowerIso, { iso: PowerIso; isoLabel: string; rows: DashboardIsoRow[] }>();
    for (const row of data.rows) {
      let group = byIso.get(row.iso);
      if (!group) {
        group = { iso: row.iso, isoLabel: row.isoLabel, rows: [] };
        byIso.set(row.iso, group);
        groups.push(group);
      }
      group.rows.push(row);
    }
    return groups;
  }, [data]);
  const mainHubRows = useMemo(() => {
    if (!data) return [];
    return MAIN_HUB_ORDER.map((iso) => {
      const mainHub = MAIN_HUB_BY_ISO[iso];
      return (
        data.rows.find((row) => row.iso === iso && row.hub === mainHub) ??
        data.rows.find((row) => row.iso === iso)
      );
    }).filter((row): row is DashboardIsoRow => Boolean(row));
  }, [data]);

  const handleDateSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSelectedDate(dateInput || null);
    setRefreshToken((value) => value + 1);
  };

  const ready = !loading;

  return (
    <div
      className="mx-auto w-full max-w-[1252px] space-y-4"
      data-perf-ready={ready ? "power-settles-dashboard" : undefined}
    >
      <ControlCard title="Power Settles">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Filters
            </span>
            <span className="h-px flex-1 bg-gray-800" />
            <span className="text-xs text-gray-500">
              {data
                ? `${data.summary.completeHubCount}/${data.summary.hubCount} hubs complete`
                : "DA / RT / DART OnPk-OffPeak"}
            </span>
          </div>

          <div className="space-y-2">
            <form onSubmit={handleDateSubmit} className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Date
              </span>
              <input
                type="date"
                value={dateInput}
                onChange={(event) => setDateInput(event.target.value)}
                className="h-8 rounded-md border border-gray-700 bg-gray-900 px-2 text-xs text-gray-200 focus:border-gray-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                Load
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateInput("");
                  setSelectedDate(null);
                  setRefreshToken((value) => value + 1);
                }}
                className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-200"
              >
                Yesterday
              </button>
            </form>
            <FilterPills
              label="Component"
              options={COMPONENT_TABS}
              value={component}
              onChange={setComponent}
            />
          </div>

          {data && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span>
                Date <span className="font-semibold tabular-nums text-gray-300">{data.requestedDate ?? data.defaultDate}</span>
              </span>
              <span className="text-gray-700">/</span>
              <span>
                As of <span className="font-semibold tabular-nums text-gray-300">{fmtStamp(data.summary.latestAsOf)}</span>
              </span>
              {componentFallbackApplies && (
                <>
                  <span className="text-gray-700">/</span>
                  <span>ERCOT uses Total</span>
                </>
              )}
              {data.summary.unverifiedFallbackHubCount > 0 && (
                <>
                  <span className="text-gray-700">/</span>
                  <span>
                    {data.summary.unverifiedFallbackHubCount} unverified RT fallback
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </ControlCard>

      {loading && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading Power Settles...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {data && (
        <>
          <MainHubSummary rows={mainHubRows} />
          <section
            className="grid w-full grid-cols-[minmax(0,620px)] justify-center gap-3 2xl:grid-cols-[repeat(2,minmax(0,620px))]"
            aria-label="Power Settles ISO summaries"
          >
            {isoCards.map((card) => (
              <IsoSummaryCard
                key={card.iso}
                isoLabel={card.isoLabel}
                rows={card.rows}
                requestedComponent={data.component}
              />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
