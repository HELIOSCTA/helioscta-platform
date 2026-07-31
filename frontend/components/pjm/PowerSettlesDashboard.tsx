"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import DashboardTabs, { type DashboardTabOption } from "@/components/dashboard/DashboardTabs";
import DataTableShell from "@/components/dashboard/DataTableShell";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

type PowerIso = "pjm" | "ercot" | "isone" | "caiso";
type RtLmpSource = "verified" | "unverified";
type DashboardStatus = "ok" | "partial" | "missing";

interface ProductSummary {
  flatAvg: number | null;
  onPeakAvg: number | null;
  offPeakAvg: number | null;
  peakHour: number | null;
  peakPrice: number | null;
  observationCount: number;
}

interface LookbackDay {
  date: string;
  daFlatAvg: number | null;
  rtFlatAvg: number | null;
  dartFlatAvg: number | null;
}

interface DashboardIsoRow {
  iso: PowerIso;
  isoLabel: string;
  hub: string;
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
  lookback: LookbackDay[];
}

interface PowerSettlesDashboardPayload {
  component: "total";
  rtSource: RtLmpSource;
  lookbackDays: number;
  requestedDate: string | null;
  datePolicy: "requested" | "per-iso-latest-complete";
  rows: DashboardIsoRow[];
  summary: {
    isoCount: number;
    completeIsoCount: number;
    partialIsoCount: number;
    missingIsoCount: number;
    latestAsOf: string | null;
  };
}

interface LookbackTableRow {
  key: string;
  iso: PowerIso;
  isoLabel: string;
  date: string;
  hub: string;
  daFlatAvg: number | null;
  rtFlatAvg: number | null;
  dartFlatAvg: number | null;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const LOOKBACK_OPTIONS = [3, 5, 7, 10, 14] as const;
const ISO_ORDER: Record<PowerIso, number> = {
  pjm: 0,
  ercot: 1,
  isone: 2,
  caiso: 3,
};
const RT_SOURCE_TABS: Array<DashboardTabOption<RtLmpSource>> = [
  { value: "unverified", label: "Unverified RT" },
  { value: "verified", label: "Verified RT" },
];

function buildApiUrl({
  date,
  lookbackDays,
  rtSource,
  refresh,
}: {
  date: string | null;
  lookbackDays: number;
  rtSource: RtLmpSource;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({
    lookbackDays: String(lookbackDays),
    rtSource,
  });
  if (date) params.set("date", date);
  if (refresh) params.set("refresh", "1");
  return `/api/power-settles-dashboard?${params.toString()}`;
}

function buildCacheKey({
  date,
  lookbackDays,
  rtSource,
}: {
  date: string | null;
  lookbackDays: number;
  rtSource: RtLmpSource;
}): string {
  return `api:power-settles-dashboard:${date ?? "latest"}:${lookbackDays}:${rtSource}`;
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

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value !== null);
  if (nums.length === 0) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
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

function metricCell(value: number | null, signed = false): React.ReactNode {
  return (
    <span className={`tabular-nums ${signed ? dartClass(value) : "text-gray-200"}`}>
      {fmtPrice(value, signed)}
    </span>
  );
}

function KpiCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-gray-100">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{detail}</p>
    </div>
  );
}

export default function PowerSettlesDashboard() {
  const [rtSource, setRtSource] = useState<RtLmpSource>("unverified");
  const [lookbackDays, setLookbackDays] = useState(7);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dateInput, setDateInput] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
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
        refresh: forceRefresh,
      }),
    [forceRefresh, lookbackDays, rtSource, selectedDate],
  );
  const cacheKey = useMemo(
    () => buildCacheKey({ date: selectedDate, lookbackDays, rtSource }),
    [lookbackDays, rtSource, selectedDate],
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
  }, [apiUrl, cacheKey, forceRefresh]);

  const lookbackRows = useMemo<LookbackTableRow[]>(() => {
    if (!data) return [];
    return data.rows
      .flatMap((row) =>
        row.lookback.map((day) => ({
          key: `${row.iso}-${day.date}`,
          iso: row.iso,
          isoLabel: row.isoLabel,
          date: day.date,
          hub: row.hub,
          daFlatAvg: day.daFlatAvg,
          rtFlatAvg: day.rtFlatAvg,
          dartFlatAvg: day.dartFlatAvg,
        })),
      )
      .sort((left, right) => {
        const dateSort = right.date.localeCompare(left.date);
        return dateSort || ISO_ORDER[left.iso] - ISO_ORDER[right.iso];
      });
  }, [data]);

  const avgDartFlat = useMemo(
    () => avg(data?.rows.map((row) => row.products.dart.flatAvg) ?? []),
    [data],
  );

  const handleDateSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSelectedDate(dateInput || null);
  };

  const ready = !loading;

  return (
    <div
      className="space-y-4"
      data-perf-ready={ready ? "power-settles-dashboard" : undefined}
    >
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Total LMP
            </p>
            <p className="mt-1 text-sm text-gray-300">
              DA, RT, and DART across default hub settles.
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <DashboardTabs
              tabs={RT_SOURCE_TABS}
              activeValue={rtSource}
              onChange={setRtSource}
              ariaLabel="RT source"
              variant="secondary"
            />
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Lookback
              </span>
              <select
                value={lookbackDays}
                onChange={(event) => setLookbackDays(Number(event.target.value))}
                className="h-9 rounded-md border border-gray-700 bg-gray-900 px-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              >
                {LOOKBACK_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}d
                  </option>
                ))}
              </select>
            </label>
            <form onSubmit={handleDateSubmit} className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Date
                </span>
                <input
                  type="date"
                  value={dateInput}
                  onChange={(event) => setDateInput(event.target.value)}
                  className="h-9 rounded-md border border-gray-700 bg-gray-900 px-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                />
              </label>
              <button
                type="submit"
                className="h-9 rounded-md border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                Load
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateInput("");
                  setSelectedDate(null);
                }}
                className="h-9 rounded-md border border-gray-800 bg-gray-950/40 px-3 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-200"
              >
                Latest
              </button>
            </form>
            <button
              type="button"
              onClick={() => setRefreshToken((value) => value + 1)}
              className="h-9 rounded-md border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Refresh
            </button>
          </div>
        </div>
      </section>

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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="ISO Coverage"
              value={`${data.summary.completeIsoCount}/${data.summary.isoCount}`}
              detail={`${data.summary.partialIsoCount} partial, ${data.summary.missingIsoCount} missing`}
            />
            <KpiCard
              label="RT Source"
              value={data.rtSource === "verified" ? "Verified" : "Unverified"}
              detail="Applied where the ISO has separate RT feeds"
            />
            <KpiCard
              label="Date Policy"
              value={data.datePolicy === "requested" ? "Selected" : "Per ISO"}
              detail={data.requestedDate ?? "Latest complete DA/RT date by ISO"}
            />
            <KpiCard
              label="Avg DART Flat"
              value={fmtPrice(avgDartFlat, true)}
              detail={`Default hubs, ${data.component.toUpperCase()} component`}
            />
          </div>

          <DataTableShell
            title="Power Settles Summary"
            subtitle={`Default hubs, ${data.lookbackDays}-day bounded context`}
          >
            <table className="w-full min-w-[1180px] border-collapse text-xs text-gray-200">
              <thead className="bg-gray-950 text-gray-500">
                <tr>
                  <th className="sticky left-0 z-20 bg-gray-950 px-3 py-2 text-left font-semibold uppercase tracking-wide">
                    ISO
                  </th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Date</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Hub</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">
                    Status
                  </th>
                  <th className="border-l border-gray-700 px-3 py-2 text-right font-semibold uppercase tracking-wide">
                    DA Flat
                  </th>
                  <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">
                    DA OnPk
                  </th>
                  <th className="border-l border-gray-700 px-3 py-2 text-right font-semibold uppercase tracking-wide">
                    RT Flat
                  </th>
                  <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">
                    RT OnPk
                  </th>
                  <th className="border-l border-gray-700 px-3 py-2 text-right font-semibold uppercase tracking-wide">
                    DART Flat
                  </th>
                  <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">
                    DART OnPk
                  </th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">
                    As Of
                  </th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.rows.map((row) => (
                  <tr key={row.iso} className="hover:bg-gray-900/60">
                    <td className="sticky left-0 z-10 bg-[#0d1119] px-3 py-2 font-semibold text-gray-100">
                      {row.isoLabel}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-gray-300">
                      {fmtDate(row.targetDate)}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-300">{row.hub}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusClass(row.status)}`}
                        title={row.statusDetail}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="border-l border-gray-700 px-3 py-2 text-right">
                      {metricCell(row.products.da.flatAvg)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {metricCell(row.products.da.onPeakAvg)}
                    </td>
                    <td className="border-l border-gray-700 px-3 py-2 text-right">
                      {metricCell(row.products.rt.flatAvg)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {metricCell(row.products.rt.onPeakAvg)}
                    </td>
                    <td className="border-l border-gray-700 px-3 py-2 text-right">
                      {metricCell(row.products.dart.flatAvg, true)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {metricCell(row.products.dart.onPeakAvg, true)}
                    </td>
                    <td className="px-3 py-2 text-gray-400">
                      <span title={`DA: ${row.sourceTables.da}; RT: ${row.sourceTables.rt}`}>
                        {fmtStamp(row.dataAsOf)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {row.detailUrl ? (
                        <a
                          href={row.detailUrl}
                          className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>

          <DataTableShell
            title="Recent Daily Flat"
            subtitle="Flat averages by ISO and default hub"
          >
            <table className="w-full min-w-[760px] border-collapse text-xs text-gray-200">
              <thead className="bg-gray-950 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Date</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">ISO</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Hub</th>
                  <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">
                    DA Flat
                  </th>
                  <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">
                    RT Flat
                  </th>
                  <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">
                    DART Flat
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {lookbackRows.map((row) => (
                  <tr key={row.key} className="hover:bg-gray-900/60">
                    <td className="px-3 py-2 tabular-nums text-gray-300">{row.date}</td>
                    <td className="px-3 py-2 font-semibold text-gray-100">{row.isoLabel}</td>
                    <td className="px-3 py-2 text-gray-400">{row.hub}</td>
                    <td className="px-3 py-2 text-right">{metricCell(row.daFlatAvg)}</td>
                    <td className="px-3 py-2 text-right">{metricCell(row.rtFlatAvg)}</td>
                    <td className="px-3 py-2 text-right">
                      {metricCell(row.dartFlatAvg, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
        </>
      )}
    </div>
  );
}
