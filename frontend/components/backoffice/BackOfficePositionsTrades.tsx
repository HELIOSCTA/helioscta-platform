"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import type {
  BackOfficePositionsTradesCommodity,
  BackOfficePositionsTradesInstrument,
  BackOfficePositionsTradesMark,
  BackOfficePositionsTradesPayload,
} from "@/lib/positionsAndTrades/backOfficePositionsTradesTypes";

const API_PATH = "/api/backoffice-positions-trades";
const API_CACHE_TTL_MS = 2 * 60 * 1000;
const AUTO_REFRESH_MS = 2 * 60 * 1000;

const COMMODITY_OPTIONS: Array<{
  value: BackOfficePositionsTradesCommodity;
  label: string;
}> = [
  { value: "both", label: "Both" },
  { value: "natural_gas", label: "Natural Gas" },
  { value: "power", label: "Power" },
];

const INSTRUMENT_OPTIONS: Array<{
  value: BackOfficePositionsTradesInstrument;
  label: string;
}> = [
  { value: "both", label: "Both" },
  { value: "fixed_price", label: "Fixed Price" },
  { value: "options", label: "Options" },
];

const MARK_OPTIONS: Array<{ value: BackOfficePositionsTradesMark; label: string }> = [
  { value: "live", label: "Live" },
  { value: "settlement", label: "Settlement" },
];

function apiUrl({
  selectedDate,
  account,
  commodity,
  instrument,
  mark,
  refreshNonce,
}: {
  selectedDate: string;
  account: string;
  commodity: BackOfficePositionsTradesCommodity;
  instrument: BackOfficePositionsTradesInstrument;
  mark: BackOfficePositionsTradesMark;
  refreshNonce: number;
}): string {
  const params = new URLSearchParams();
  if (selectedDate) params.set("asOf", selectedDate);
  if (account !== "All Accounts") params.set("account", account);
  if (commodity !== "both") params.set("commodity", commodity);
  if (instrument !== "both") params.set("instrument", instrument);
  if (mark !== "live") params.set("mark", mark);
  if (refreshNonce > 0) params.set("refresh", String(refreshNonce));
  const query = params.toString();
  return query ? `${API_PATH}?${query}` : API_PATH;
}

function formatCell(value: number | undefined, mark: BackOfficePositionsTradesMark): string {
  if (value == null || Math.abs(value) < 0.000001) return "-";
  const rounded = mark === "settlement" ? Math.round(value) : value;
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: mark === "settlement" ? 0 : 1,
  }).format(Math.abs(rounded));
  return value > 0 ? `+${formatted}` : `-${formatted}`;
}

function cellClass(value: number | undefined): string {
  if (value == null || Math.abs(value) < 0.000001) return "text-gray-700";
  return value > 0 ? "text-emerald-200" : "text-red-200";
}

function SegmentedControl<T extends string>({
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
      <div className="flex rounded-md border border-gray-800 bg-[#10131b] p-0.5">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`h-7 rounded px-2 text-xs font-semibold transition-colors ${
                active
                  ? "bg-gray-100 text-gray-950"
                  : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <section className="rounded-md border border-gray-800 bg-[#12141d] p-4 text-sm text-gray-400">
      Loading Positions & Trades...
    </section>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <section className="rounded-md border border-red-500/30 bg-red-500/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-red-100">
            Positions & Trades failed to load
          </h2>
          <p className="mt-1 text-sm leading-6 text-red-200">{error}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-red-400/40 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-100 transition-colors hover:bg-red-500/30"
        >
          Retry
        </button>
      </div>
    </section>
  );
}

function MatrixTable({
  payload,
}: {
  payload: BackOfficePositionsTradesPayload;
}) {
  if (payload.rows.length === 0) {
    return (
      <section className="rounded-md border border-gray-800 bg-[#12141d] p-4 text-sm text-gray-400">
        No NAV positions match the selected filters.
      </section>
    );
  }

  return (
    <section className="rounded-md border border-gray-800 bg-[#12141d] shadow-xl shadow-black/20">
      <div className="border-b border-gray-800 px-3 py-2">
        <h2 className="text-sm font-semibold text-gray-100">Term / Monthly Positions</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-max border-collapse text-left text-xs">
          <thead className="bg-gray-950/70 text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="sticky left-0 z-10 min-w-[260px] border-r border-gray-800 bg-gray-950/95 px-3 py-2 font-semibold">
                Product <span className="text-gray-400">ASC</span>
              </th>
              {payload.columns.map((column) => (
                <th
                  key={column.key}
                  className="min-w-[76px] border-r border-gray-800 px-2 py-2 text-right font-semibold"
                >
                  {column.label}
                </th>
              ))}
              <th className="min-w-[82px] px-2 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {payload.rows.map((row) => (
              <tr key={row.product} className="bg-[#11141d] hover:bg-gray-900/70">
                <td className="sticky left-0 z-10 border-r border-gray-800 bg-[#11141d] px-3 py-2 font-semibold text-gray-100">
                  <div>{row.product}</div>
                  <div className="mt-0.5 text-[10px] font-medium text-gray-600">
                    {row.commodity} | {row.instrument}
                  </div>
                </td>
                {payload.columns.map((column) => {
                  const value = row.values[column.key];
                  return (
                    <td
                      key={`${row.product}:${column.key}`}
                      className={`border-r border-gray-800 px-2 py-2 text-right font-semibold tabular-nums ${cellClass(value)}`}
                    >
                      {formatCell(value, payload.filters.mark)}
                    </td>
                  );
                })}
                <td
                  className={`px-2 py-2 text-right font-bold tabular-nums ${cellClass(row.total)}`}
                >
                  {formatCell(row.total, payload.filters.mark)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function BackOfficePositionsTrades() {
  const [payload, setPayload] = useState<BackOfficePositionsTradesPayload | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [account, setAccount] = useState("All Accounts");
  const [commodity, setCommodity] =
    useState<BackOfficePositionsTradesCommodity>("both");
  const [instrument, setInstrument] =
    useState<BackOfficePositionsTradesInstrument>("both");
  const [mark, setMark] = useState<BackOfficePositionsTradesMark>("live");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRefreshNonce((value) => value + 1);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, []);

  const url = useMemo(
    () =>
      apiUrl({
        selectedDate,
        account,
        commodity,
        instrument,
        mark,
        refreshNonce,
      }),
    [account, commodity, instrument, mark, refreshNonce, selectedDate],
  );

  useEffect(() => {
    let active = true;
    const forceRefresh = refreshNonce > 0;
    setLoading(true);
    setError(null);

    fetchJsonWithCache<BackOfficePositionsTradesPayload>({
      key: `backoffice-positions-trades:${url}`,
      url,
      ttlMs: API_CACHE_TTL_MS,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
      persist: "session",
    })
      .then((nextPayload) => {
        if (!active) return;
        setPayload(nextPayload);
        if (!selectedDate && nextPayload.selectedDate) {
          setSelectedDate(nextPayload.selectedDate);
        }
        if (!nextPayload.accounts.includes(account)) {
          setAccount("All Accounts");
        }
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || "Failed to load Positions & Trades");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [account, selectedDate, url, refreshNonce]);

  if (loading && !payload) return <LoadingState />;
  if (error && !payload) {
    return <ErrorState error={error} onRetry={() => setRefreshNonce((value) => value + 1)} />;
  }
  if (!payload) return null;

  return (
    <div className="space-y-4" data-perf-ready="backoffice-positions-trades">
      {error && (
        <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-200">
          Refresh failed; showing cached data. {error}
        </div>
      )}

      <section className="rounded-md border border-gray-800 bg-[#12141d] p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/?view=backoffice-home"
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Home
            </Link>
            <span className="rounded-md border border-gray-600 bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-950">
              Position Sheet
            </span>
            <Link
              href="/?view=backoffice-nav-daily-position-sheet"
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
            >
              NAV Daily Position Sheet
            </Link>
            <label className="ml-0 flex items-center gap-2 text-xs font-semibold text-gray-500 xl:ml-2">
              <span className="uppercase tracking-wider">As Of</span>
              <select
                value={payload.selectedDate ?? selectedDate}
                onChange={(event) => {
                  setSelectedDate(event.target.value);
                  setRefreshNonce((value) => value + 1);
                }}
                className="h-8 rounded-md border border-gray-700 bg-[#10131b] px-2 text-xs font-semibold text-gray-200 outline-none"
              >
                {payload.availableDates.map((date) => (
                  <option key={date.navDate} value={date.navDate}>
                    {date.navDate}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-500">
              <span className="uppercase tracking-wider">Account</span>
              <select
                value={account}
                onChange={(event) => {
                  setAccount(event.target.value);
                  setRefreshNonce((value) => value + 1);
                }}
                className="h-8 rounded-md border border-gray-700 bg-[#10131b] px-2 text-xs font-semibold text-gray-200 outline-none"
              >
                <option value="All Accounts">All Accounts</option>
                {payload.accounts.map((nextAccount) => (
                  <option key={nextAccount} value={nextAccount}>
                    {nextAccount}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="text-xs font-semibold text-gray-500">
            <span className="text-gray-400">NAV</span>{" "}
            {payload.asOfLabel.replace(/^NAV\s*/, "")}
            <span className="ml-2">auto-refresh 2m</span>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-gray-800 bg-[#12141d] p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <SegmentedControl
              label="Commodity"
              options={COMMODITY_OPTIONS}
              value={commodity}
              onChange={(value) => {
                setCommodity(value);
                setRefreshNonce((current) => current + 1);
              }}
            />
            <SegmentedControl
              label="Instrument"
              options={INSTRUMENT_OPTIONS}
              value={instrument}
              onChange={(value) => {
                setInstrument(value);
                setRefreshNonce((current) => current + 1);
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <SegmentedControl
              label="Mark"
              options={MARK_OPTIONS}
              value={mark}
              onChange={(value) => {
                setMark(value);
                setRefreshNonce((current) => current + 1);
              }}
            />
            <span className="text-xs font-semibold text-gray-500">{payload.liveLabel}</span>
          </div>
        </div>
      </section>

      <MatrixTable payload={payload} />

      <p className="text-center text-xs text-gray-600">{payload.sourceChecks}</p>
    </div>
  );
}
