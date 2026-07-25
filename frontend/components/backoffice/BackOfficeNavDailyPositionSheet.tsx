"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import type {
  BackOfficeNavDailyPositionSheetAccountColumn,
  BackOfficeNavDailyPositionSheetGasCell,
  BackOfficeNavDailyPositionSheetPayload,
} from "@/lib/positionsAndTrades/backOfficeNavDailyPositionSheetTypes";

const API_PATH = "/api/backoffice-nav-daily-position-sheet";
const API_CACHE_TTL_MS = 60 * 1000;

function apiUrl(selectedDate: string, optionMonth: string, refreshNonce: number): string {
  const params = new URLSearchParams();
  if (selectedDate) params.set("date", selectedDate);
  if (optionMonth) params.set("optionMonth", optionMonth);
  if (refreshNonce > 0) params.set("refresh", String(refreshNonce));
  const query = params.toString();
  return query ? `${API_PATH}?${query}` : API_PATH;
}

function fmtNumber(value: number, emptyZero = true): string {
  if (!Number.isFinite(value)) return "-";
  if (emptyZero && value === 0) return "-";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(value);
}

function valueClass(value: number): string {
  if (value > 0) return "text-emerald-200";
  if (value < 0) return "text-red-200";
  return "text-gray-500";
}

function cellTitle(cell: BackOfficeNavDailyPositionSheetGasCell): string {
  const gasLots = cell.gasLots == null ? "unknown gas lots" : `${fmtNumber(cell.gasLots, false)} gas lots`;
  return `${fmtNumber(cell.quantity, false)} quantity | ${gasLots}`;
}

function metricTextClass(status: BackOfficeNavDailyPositionSheetPayload["metrics"][number]["status"]): string {
  if (status === "watch") return "text-yellow-200";
  if (status === "unavailable") return "text-gray-500";
  return "text-gray-300";
}

function worksheetStatus(payload: BackOfficeNavDailyPositionSheetPayload): {
  label: string;
  className: string;
} {
  if (payload.metrics.some((metric) => metric.status === "watch")) {
    return {
      label: "warning",
      className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
    };
  }
  if (payload.metrics.some((metric) => metric.status === "unavailable")) {
    return {
      label: "partial",
      className: "border-gray-600 bg-gray-800 text-gray-300",
    };
  }
  return {
    label: "ok",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  };
}

function HeaderStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-gray-800 bg-[#0d1018] px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-gray-100">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{detail}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <section className="rounded-md border border-gray-800 bg-[#12141d] p-4 text-sm text-gray-400">
      Loading NAV Daily Position Sheet...
    </section>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <section className="rounded-md border border-red-500/30 bg-red-500/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-red-100">
            NAV Daily Position Sheet failed to load
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

function HeaderPanel({
  payload,
  selectedDate,
  setSelectedDate,
  refresh,
}: {
  payload: BackOfficeNavDailyPositionSheetPayload;
  selectedDate: string;
  setSelectedDate: (value: string) => void;
  refresh: () => void;
}) {
  const status = worksheetStatus(payload);
  return (
    <section className="rounded-md border border-gray-800 bg-gray-950/80 p-4 shadow-xl shadow-black/25">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <div className="inline-flex overflow-hidden rounded-md border border-gray-700 bg-[#0f1117] text-xs font-semibold">
            <button
              type="button"
              className="h-6 border-r border-gray-700 bg-gray-100 px-3 text-gray-950"
            >
              Gas
            </button>
            <button
              type="button"
              disabled
              title="Power view is not wired yet."
              className="h-6 px-3 text-gray-500 disabled:cursor-not-allowed"
            >
              Power
            </button>
          </div>
          <h2 className="mt-3 text-xl font-bold text-gray-100">Gas Futures Position Matrix</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
            NAV-only gas futures view using position valuation for exposure and riskmatrix expiry dates
            for active/expired handling. ICE PHH/H futures are shown gas-equivalent as raw lots divided by 4.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 xl:justify-end">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              NAV As Of
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="h-10 rounded-md border border-gray-700 bg-[#0f1117] px-3 text-sm font-semibold text-gray-200 outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              if (payload.latestDate) setSelectedDate(payload.latestDate);
              refresh();
            }}
            className="h-10 rounded-md border border-gray-700 bg-gray-800 px-4 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
          >
            Latest NAV
          </button>
          <button
            type="button"
            onClick={refresh}
            className="h-10 rounded-md border border-gray-700 bg-gray-800 px-4 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
          >
            Refresh
          </button>
          <button
            type="button"
            disabled
            title="Excel download is not wired yet."
            className="h-10 rounded-md border border-gray-700 bg-gray-800 px-4 text-xs font-semibold text-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Download Excel
          </button>
          <button
            type="button"
            disabled
            title="Power RT Excel export is not wired yet."
            className="h-10 rounded-md border border-gray-700 bg-gray-800 px-4 text-xs font-semibold text-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Power RT Excel
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <HeaderStat
          label="As Of"
          value={payload.selectedDate ?? "--"}
          detail="Latest available NAV"
        />
        <HeaderStat
          label="Report Date"
          value={payload.reportDate}
          detail="Expiry comparison date"
        />
        <HeaderStat
          label="NAV Updated"
          value={payload.navUpdatedLabel}
          detail="Auto-refreshes latest every 60s"
        />
      </div>
      <div className="mt-3 rounded-md border border-gray-800 bg-[#0d1018] px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
          <span
            className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${status.className}`}
          >
            {status.label}
          </span>
          {payload.metrics.map((metric, index) => (
            <span key={metric.label} className={metricTextClass(metric.status)}>
              {index > 0 ? "| " : ""}
              {metric.label}: {metric.value}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function MatrixCell({ cell }: { cell: BackOfficeNavDailyPositionSheetGasCell }) {
  return (
    <td
      className={`min-w-[52px] border-r border-gray-800 px-2 py-2 text-right font-semibold ${valueClass(cell.quantity)}`}
      title={cellTitle(cell)}
    >
      {fmtNumber(cell.quantity)}
    </td>
  );
}

function AccountHeader({ account }: { account: BackOfficeNavDailyPositionSheetAccountColumn }) {
  return (
    <th
      colSpan={account.productCodes.length + 1}
      className="border-r border-gray-800 px-3 py-2 text-center font-semibold text-gray-300"
    >
      {account.label}
    </th>
  );
}

function GasFuturesMatrix({ payload }: { payload: BackOfficeNavDailyPositionSheetPayload }) {
  const { accountColumns, productCodes, rows, totalRow } = payload.gasFutures;
  return (
    <section className="rounded-md border border-gray-800 bg-[#12141d] shadow-xl shadow-black/20">
      <div className="overflow-x-auto">
        <table className="min-w-[1500px] w-full border-collapse text-left text-xs">
          <thead className="bg-gray-950/70 text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="sticky left-0 z-20 min-w-[92px] border-r border-gray-800 bg-gray-950 px-3 py-2 font-semibold">
                YYYYMM
              </th>
              {accountColumns.map((account) => (
                <AccountHeader key={account.key} account={account} />
              ))}
              <th
                rowSpan={2}
                className="min-w-[88px] border-r border-gray-800 bg-gray-950 px-3 py-2 text-right font-semibold text-gray-300"
              >
                All Total
              </th>
            </tr>
            <tr>
              <th className="sticky left-0 z-20 border-r border-gray-800 bg-gray-950 px-3 py-2 font-semibold text-gray-600">
                &nbsp;
              </th>
              {accountColumns.flatMap((account) => [
                ...productCodes.map((productCode) => (
                  <th
                    key={`${account.key}:${productCode}`}
                    className="min-w-[52px] border-r border-gray-800 px-2 py-2 text-right font-semibold text-gray-500"
                  >
                    {productCode}
                  </th>
                )),
                <th
                  key={`${account.key}:total`}
                  className="min-w-[64px] border-r border-gray-800 bg-gray-900/50 px-2 py-2 text-right font-semibold text-gray-400"
                >
                  Total
                </th>,
              ])}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {rows.map((row) => (
              <tr key={row.yyyymm} className="bg-[#11141d]">
                <td className="sticky left-0 z-10 border-r border-gray-800 bg-[#11141d] px-3 py-2">
                  <p className="font-semibold text-gray-100">{row.yyyymm}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">{row.monthLabel}</p>
                </td>
                {accountColumns.flatMap((account) => [
                  ...productCodes.map((productCode) => (
                    <MatrixCell
                      key={`${row.yyyymm}:${account.key}:${productCode}`}
                      cell={row.values[account.key]?.[productCode] ?? { quantity: 0, gasLots: null }}
                    />
                  )),
                  <td
                    key={`${row.yyyymm}:${account.key}:total`}
                    className={`min-w-[64px] border-r border-gray-800 bg-gray-900/30 px-2 py-2 text-right font-bold ${valueClass(row.accountTotals[account.key] ?? 0)}`}
                  >
                    {fmtNumber(row.accountTotals[account.key] ?? 0)}
                  </td>,
                ])}
                <td
                  className={`min-w-[88px] border-r border-gray-800 bg-gray-900/40 px-3 py-2 text-right font-bold ${valueClass(row.total)}`}
                >
                  {fmtNumber(row.total)}
                </td>
              </tr>
            ))}
            <tr className="bg-gray-950/70">
              <td className="sticky left-0 z-10 border-r border-gray-800 bg-gray-950 px-3 py-2 font-bold text-gray-100">
                NET TOTAL
              </td>
              {accountColumns.flatMap((account) => [
                ...productCodes.map((productCode) => (
                  <MatrixCell
                    key={`total:${account.key}:${productCode}`}
                    cell={totalRow[account.key]?.[productCode] ?? { quantity: 0, gasLots: null }}
                  />
                )),
                <td
                  key={`total:${account.key}:total`}
                  className={`min-w-[64px] border-r border-gray-800 bg-gray-900/50 px-2 py-2 text-right font-bold ${valueClass(payload.gasFutures.accountTotals[account.key] ?? 0)}`}
                >
                  {fmtNumber(payload.gasFutures.accountTotals[account.key] ?? 0)}
                </td>,
              ])}
              <td
                className={`min-w-[88px] border-r border-gray-800 bg-gray-900/60 px-3 py-2 text-right font-bold ${valueClass(payload.gasFutures.total)}`}
              >
                {fmtNumber(payload.gasFutures.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OptionsLadder({
  payload,
  setOptionMonth,
}: {
  payload: BackOfficeNavDailyPositionSheetPayload;
  setOptionMonth: (value: string) => void;
}) {
  return (
    <section className="rounded-md border border-gray-800 bg-[#12141d] p-4 shadow-xl shadow-black/20">
      <h2 className="text-sm font-semibold text-gray-100">Gas Options Ladder</h2>
      <p className="mt-1 text-sm leading-6 text-gray-400">
        {payload.optionSummary.activeRows} active option rows | {payload.optionSummary.selectedMonthLabel}
      </p>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {payload.optionMonths.map((month) => {
          const active = month.yyyymm === payload.optionSummary.selectedMonth;
          return (
            <button
              key={month.yyyymm}
              type="button"
              onClick={() => setOptionMonth(month.yyyymm)}
              className={`min-w-[112px] rounded-md border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                active
                  ? "border-gray-500 bg-gray-100 text-gray-950"
                  : "border-gray-800 bg-[#10131b] text-gray-300 hover:bg-gray-800"
              }`}
            >
              <span className="block">{month.label}</span>
              <span className={active ? "block text-gray-600" : "block text-gray-500"}>{month.yyyymm}</span>
              <span className="block">Net {fmtNumber(month.netQuantity, false)}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 overflow-x-auto rounded-md border border-gray-800">
        <table className="min-w-[1120px] w-full border-collapse text-left text-xs">
          <thead className="bg-gray-950/70 text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              {[
                "Exchange",
                "Strike",
                "Put Qty",
                "Call Qty",
                "Net Qty",
                "Put Settle",
                "Call Settle",
                "Put Chg",
                "Call Chg",
                "Settle P&L",
                "Top Account",
                "Detail",
              ].map((header) => (
                <th key={header} className="px-3 py-2 font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {payload.optionRows.length === 0 ? (
              <tr className="bg-[#11141d]">
                <td colSpan={12} className="px-3 py-3 text-gray-500">
                  No active rows for this month.
                </td>
              </tr>
            ) : (
              payload.optionRows.map((row) => (
                <tr key={`${row.exchange}:${row.strike}`} className="bg-[#11141d]">
                  <td className="px-3 py-2 font-semibold text-gray-100">{row.exchange}</td>
                  <td className="px-3 py-2 text-gray-300">{fmtNumber(row.strike, false)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${valueClass(row.putQuantity)}`}>
                    {fmtNumber(row.putQuantity)}
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold ${valueClass(row.callQuantity)}`}>
                    {fmtNumber(row.callQuantity)}
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold ${valueClass(row.netQuantity)}`}>
                    {fmtNumber(row.netQuantity, false)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-300">{fmtPrice(row.putSettle)}</td>
                  <td className="px-3 py-2 text-right text-gray-300">{fmtPrice(row.callSettle)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{fmtPrice(row.putChange)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{fmtPrice(row.callChange)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${valueClass(row.settlePnl)}`}>
                    {fmtNumber(row.settlePnl, false)}
                  </td>
                  <td className="px-3 py-2 text-gray-300">{row.topAccount ?? "-"}</td>
                  <td className="px-3 py-2 text-gray-300">Accounts</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function BackOfficeNavDailyPositionSheet() {
  const [payload, setPayload] = useState<BackOfficeNavDailyPositionSheetPayload | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [optionMonth, setOptionMonth] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const url = useMemo(
    () => apiUrl(selectedDate, optionMonth, refreshNonce),
    [optionMonth, refreshNonce, selectedDate],
  );

  useEffect(() => {
    let active = true;
    const forceRefresh = refreshNonce > 0;

    setLoading(true);
    setError(null);

    fetchJsonWithCache<BackOfficeNavDailyPositionSheetPayload>({
      key: `backoffice-nav-daily-position-sheet:${url}`,
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
        if (!optionMonth && nextPayload.optionSummary.selectedMonth) {
          setOptionMonth(nextPayload.optionSummary.selectedMonth);
        }
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || "Failed to load NAV Daily Position Sheet");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [optionMonth, refreshNonce, selectedDate, url]);

  if (loading && !payload) return <LoadingState />;
  if (error && !payload) {
    return <ErrorState error={error} onRetry={() => setRefreshNonce((value) => value + 1)} />;
  }
  if (!payload) return null;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-200">
          Refresh failed; showing cached data. {error}
        </div>
      )}

      <HeaderPanel
        payload={payload}
        selectedDate={selectedDate || payload.selectedDate || ""}
        setSelectedDate={(value) => {
          setSelectedDate(value);
          setOptionMonth("");
        }}
        refresh={() => setRefreshNonce((value) => value + 1)}
      />
      <GasFuturesMatrix payload={payload} />
      <OptionsLadder payload={payload} setOptionMonth={setOptionMonth} />
    </div>
  );
}
