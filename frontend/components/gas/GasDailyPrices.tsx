"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import {
  GAS_REGION_LABELS,
  type DailyGasHub,
  type DailyGasPriceRow,
  type DailyGasPricesPayload,
} from "@/lib/gasPricing";

const API_TTL_MS = 5 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 14;
const STICKY_LEFT_WIDTH = 274;

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultRange(): { startDate: string; endDate: string } {
  const endDate = addDays(new Date(), 1);
  const startDate = addDays(endDate, -(DEFAULT_RANGE_DAYS - 1));
  return {
    startDate: toDateInputValue(startDate),
    endDate: toDateInputValue(endDate),
  };
}

function buildApiUrl(startDate: string, endDate: string, refresh: boolean): string {
  const params = new URLSearchParams();
  params.set("startDate", startDate);
  params.set("endDate", endDate);
  if (refresh) params.set("refresh", "1");
  return `/api/gas-daily-prices?${params.toString()}`;
}

function buildCacheKey(startDate: string, endDate: string): string {
  return `api:gas-daily-prices:v2:vwap_close:${startDate}:${endDate}`;
}

function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return `$${value.toFixed(3)}`;
}

function heatColor(value: number | null, min: number, max: number): string {
  if (value === null || !Number.isFinite(min) || !Number.isFinite(max)) {
    return "rgba(15, 23, 42, 0.8)";
  }
  if (max <= min) return "rgba(31, 41, 55, 0.85)";
  const pct = (value - min) / (max - min);
  if (pct >= 0.5) {
    const alpha = 0.14 + (pct - 0.5) * 0.82;
    return `rgba(34, 197, 94, ${alpha})`;
  }
  const alpha = 0.14 + (0.5 - pct) * 0.82;
  return `rgba(248, 113, 113, ${alpha})`;
}

function buildColumnDomains(
  rows: DailyGasPriceRow[],
  hubs: DailyGasHub[],
): Record<string, { min: number; max: number }> {
  return Object.fromEntries(
    hubs.map((hub) => {
      const values = rows
        .map((row) => row.values[hub.symbol])
        .filter((value): value is number => value !== null);
      return [
        hub.symbol,
        {
          min: values.length ? Math.min(...values) : Number.NaN,
          max: values.length ? Math.max(...values) : Number.NaN,
        },
      ];
    }),
  );
}

export default function GasDailyPrices() {
  const initialRange = useMemo(() => defaultRange(), []);
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [refreshToken, setRefreshToken] = useState(0);
  const [data, setData] = useState<DailyGasPricesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (startDate > endDate) {
      setData(null);
      setLoading(false);
      setError("Start gas day must be on or before end gas day.");
      return;
    }

    const controller = new AbortController();
    const forceRefresh = refreshToken > 0;

    setLoading(true);
    setError(null);

    fetchJsonWithCache<DailyGasPricesPayload>({
      key: buildCacheKey(startDate, endDate),
      url: buildApiUrl(startDate, endDate, forceRefresh),
      ttlMs: API_TTL_MS,
      signal: controller.signal,
      forceRefresh,
    })
      .then(setData)
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setData(null);
        setError(caught instanceof Error ? caught.message : "Failed to load gas prices");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [endDate, refreshToken, startDate]);

  const hubs = useMemo(() => data?.hubs ?? [], [data?.hubs]);
  const columnDomains = useMemo(() => buildColumnDomains(data?.rows ?? [], hubs), [data?.rows, hubs]);

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-3 sm:grid-cols-[minmax(150px,180px)_minmax(150px,180px)_auto]">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Start Gas Day
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="h-9 w-full rounded-md border border-gray-700 bg-gray-950 px-3 text-sm font-semibold text-gray-100 outline-none focus:border-sky-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                End Gas Day
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="h-9 w-full rounded-md border border-gray-700 bg-gray-950 px-3 text-sm font-semibold text-gray-100 outline-none focus:border-sky-500"
              />
            </label>
            <button
              type="button"
              onClick={() => setRefreshToken((value) => value + 1)}
              className="h-9 self-end rounded-md border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Refresh
            </button>
          </div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">WVAP Close</div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-2 shadow-xl shadow-black/20 sm:p-3">
        <div className="max-h-[78vh] overflow-auto rounded-md border border-gray-800">
          <table className="w-max min-w-full border-collapse bg-[#0d1119] text-xs text-gray-200">
            <thead className="sticky top-0 z-30 bg-gray-950">
              <tr>
                <th
                  className="sticky left-0 top-0 z-50 bg-gray-950 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                  style={{ width: STICKY_LEFT_WIDTH }}
                >
                  Gas Day / Trade Date
                </th>
                {hubs.map((hub) => (
                  <th
                    key={`${hub.symbol}-region`}
                    className="min-w-[104px] border-l border-gray-800 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-red-300"
                  >
                    {GAS_REGION_LABELS[hub.region]}
                  </th>
                ))}
              </tr>
              <tr>
                <th
                  className="sticky left-0 top-[31px] z-50 bg-gray-950 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                  style={{ width: STICKY_LEFT_WIDTH }}
                >
                  Symbol
                </th>
                {hubs.map((hub) => (
                  <th
                    key={`${hub.symbol}-basis`}
                    className="min-w-[104px] border-l border-gray-800 bg-gray-900 px-2 py-1 text-center text-[11px] font-semibold text-gray-100"
                  >
                    WVAP Close
                    <div className="mt-0.5 text-[10px] font-bold text-gray-400">{hub.symbol}</div>
                  </th>
                ))}
              </tr>
              <tr>
                <th
                  className="sticky left-0 top-[78px] z-50 bg-gray-950 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                  style={{ width: STICKY_LEFT_WIDTH }}
                >
                  Hub
                </th>
                {hubs.map((hub) => (
                  <th
                    key={`${hub.symbol}-hub`}
                    title={hub.label}
                    className="min-w-[104px] border-l border-gray-800 px-2 py-2 text-center text-[11px] font-bold text-gray-100"
                  >
                    {hub.shortLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={hubs.length + 1 || 26} className="px-3 py-10 text-center text-sm text-gray-500">
                    Loading gas prices...
                  </td>
                </tr>
              )}
              {!loading &&
                data?.rows.map((row) => (
                  <tr key={row.gasDay} className="border-t border-gray-800 hover:bg-gray-900/60">
                    <th
                      className="sticky left-0 z-10 bg-[#0d1119] px-3 py-1.5 text-left shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                      style={{ width: STICKY_LEFT_WIDTH }}
                    >
                      <div className="grid grid-cols-[88px_1fr] gap-2">
                        <span className="font-mono font-semibold tabular-nums text-gray-100">{row.gasDay}</span>
                        <span className="font-semibold text-gray-300">{row.gasDayLabel}</span>
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] font-normal tabular-nums text-gray-600">
                        Trade {row.tradeDate}
                      </div>
                    </th>
                    {hubs.map((hub) => {
                      const value = row.values[hub.symbol] ?? null;
                      const domain = columnDomains[hub.symbol] ?? { min: Number.NaN, max: Number.NaN };
                      return (
                        <td
                          key={`${row.gasDay}-${hub.symbol}`}
                          className="border-l border-gray-800 px-2 py-1.5 text-right font-mono text-[11px] tabular-nums text-gray-100"
                          style={{ backgroundColor: heatColor(value, domain.min, domain.max) }}
                        >
                          {fmtPrice(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              {!loading && data && data.rows.length === 0 && (
                <tr>
                  <td colSpan={hubs.length + 1} className="px-3 py-10 text-center text-sm text-gray-500">
                    No gas prices are available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
