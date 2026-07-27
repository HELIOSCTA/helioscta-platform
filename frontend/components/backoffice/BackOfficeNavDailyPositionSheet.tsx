"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import type {
  BackOfficeNavDailyPositionSheetAccountColumn,
  BackOfficeNavDailyPositionSheetGasCell,
  BackOfficeNavDailyPositionSheetOptionDetailPayload,
  BackOfficeNavDailyPositionSheetOptionRow,
  BackOfficeNavDailyPositionSheetPayload,
  BackOfficeNavDailyPositionSheetPowerCell,
  BackOfficeNavDailyPositionSheetPowerFuturesSection,
} from "@/lib/positionsAndTrades/backOfficeNavDailyPositionSheetTypes";

const API_PATH = "/api/backoffice-nav-daily-position-sheet";
const API_CACHE_TTL_MS = 5 * 60 * 1000;
const API_SCHEMA_VERSION = "power-options-accounts-v1";
const DEFAULT_POWER_PRODUCT_REGION_FILTERS: string[] = [];
type ActivePositionView = "gas" | "power";

function apiUrl(
  selectedDate: string,
  optionMonth: string,
  activePositionView: ActivePositionView,
  powerProductRegions: string[],
  refreshNonce: number,
): string {
  const params = new URLSearchParams();
  params.set("schema", API_SCHEMA_VERSION);
  params.set("positionView", activePositionView);
  params.set("optionDetail", "0");
  if (activePositionView === "power") {
    [...powerProductRegions]
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      .forEach((region) => params.append("productRegion", region));
  }
  if (selectedDate) params.set("date", selectedDate);
  if (optionMonth) params.set("optionMonth", optionMonth);
  if (refreshNonce > 0) params.set("refresh", String(refreshNonce));
  const query = params.toString();
  return query ? `${API_PATH}?${query}` : API_PATH;
}

function optionDetailUrl(
  selectedDate: string,
  optionMonth: string,
  activePositionView: ActivePositionView,
  powerProductRegions: string[],
  refreshNonce: number,
): string {
  const params = new URLSearchParams();
  params.set("schema", API_SCHEMA_VERSION);
  params.set("detail", "option");
  params.set("optionDetail", "1");
  params.set("positionView", activePositionView);
  if (activePositionView === "power") {
    [...powerProductRegions]
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      .forEach((region) => params.append("productRegion", region));
  }
  if (selectedDate) params.set("date", selectedDate);
  if (optionMonth) params.set("optionMonth", optionMonth);
  if (refreshNonce > 0) params.set("refresh", String(refreshNonce));
  return `${API_PATH}?${params}`;
}

function fmtNumber(value: number, emptyZero = true): string {
  if (!Number.isFinite(value)) return "-";
  if (emptyZero && value === 0) return "-";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtPrice(value: number | null, digits = 4, fixed = false): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fixed ? digits : 0,
    maximumFractionDigits: digits,
  }).format(value);
}

function valueClass(value: number): string {
  if (value > 0) return "text-emerald-200";
  if (value < 0) return "text-red-200";
  return "text-gray-700";
}

function cellTitle(cell: BackOfficeNavDailyPositionSheetGasCell): string {
  const gasLots = cell.gasLots == null ? "unknown gas lots" : `${fmtNumber(cell.gasLots, false)} gas lots`;
  return `${fmtNumber(cell.quantity, false)} quantity | ${gasLots}`;
}

function powerCellTitle(cell: BackOfficeNavDailyPositionSheetPowerCell): string {
  const multiplier =
    cell.multiplier == null ? "unknown multiplier" : `${fmtNumber(cell.multiplier, false)} multiplier`;
  return `${fmtNumber(cell.quantity, false)} net qty | ${fmtNumber(cell.rawQuantity, false)} source qty | ${multiplier}`;
}

function metricTextClass(status: BackOfficeNavDailyPositionSheetPayload["metrics"][number]["status"]): string {
  if (status === "watch") return "text-yellow-200";
  if (status === "unavailable") return "text-gray-500";
  return "text-gray-300";
}

function worksheetStatus(metrics: BackOfficeNavDailyPositionSheetPayload["metrics"]): {
  label: string;
  className: string;
} {
  if (metrics.some((metric) => metric.status === "watch")) {
    return {
      label: "warning",
      className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
    };
  }
  if (metrics.some((metric) => metric.status === "unavailable")) {
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

function mergeOptionDetailPayload(
  current: BackOfficeNavDailyPositionSheetPayload,
  detail: BackOfficeNavDailyPositionSheetOptionDetailPayload,
): BackOfficeNavDailyPositionSheetPayload {
  if (current.selectedDate !== detail.selectedDate) return current;
  if (detail.positionView === "power") {
    if (current.powerOptionSummary.selectedMonth !== detail.selectedMonth) return current;
    return {
      ...current,
      powerOptionSummary: detail.summary,
      powerOptionRows: detail.rows,
    };
  }
  if (current.optionSummary.selectedMonth !== detail.selectedMonth) return current;
  return {
    ...current,
    optionSummary: detail.summary,
    optionRows: detail.rows,
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
    <div className="min-h-[96px] rounded-xl border border-gray-800 bg-[#080d16] px-4 py-4">
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
  activePositionView,
  setActivePositionView,
  powerProductRegions,
  setPowerProductRegions,
  selectedDate,
  setSelectedDate,
  refresh,
}: {
  payload: BackOfficeNavDailyPositionSheetPayload;
  activePositionView: ActivePositionView;
  setActivePositionView: (value: ActivePositionView) => void;
  powerProductRegions: string[];
  setPowerProductRegions: (value: string[]) => void;
  selectedDate: string;
  setSelectedDate: (value: string) => void;
  refresh: () => void;
}) {
  const isGas = activePositionView === "gas";
  const visibleMetrics = payload.metrics.filter((metric) =>
    isGas ? metric.label !== "Power active futures" : metric.label !== "Gas active futures",
  );
  const status = worksheetStatus(visibleMetrics);
  const powerRegionOptions = [
    ...new Set([...payload.metadata.productRegions, ...powerProductRegions]),
  ].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-950/80 p-4 shadow-xl shadow-black/25">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <div className="inline-flex overflow-hidden rounded-md border border-gray-700 bg-[#0f1117] p-0.5 text-xs font-semibold">
            <button
              type="button"
              aria-pressed={isGas}
              onClick={() => setActivePositionView("gas")}
              className={`h-7 rounded px-4 ${
                isGas
                  ? "bg-gray-100 text-gray-950"
                  : "text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-200"
              }`}
            >
              Gas
            </button>
            <button
              type="button"
              aria-pressed={!isGas}
              onClick={() => setActivePositionView("power")}
              className={`h-7 rounded px-4 ${
                !isGas
                  ? "border border-cyan-400/50 bg-cyan-500/10 text-cyan-100"
                  : "text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-200"
              }`}
            >
              Power
            </button>
          </div>
          <h2 className="mt-3 text-xl font-bold text-gray-100">
            {isGas ? "Gas Futures Position Matrix" : "Power Position Matrix"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
            {isGas
              ? "NAV-only gas futures view using position valuation for exposure and riskmatrix expiry dates for active/expired handling. ICE PHH/H futures are shown gas-equivalent as raw lots divided by 4."
              : "NAV-only power view pivoted by product code and grouped by power region/product family. Monthly futures and daily power futures show net source quantity."}
          </p>
          {!isGas && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Region
              </span>
              <button
                type="button"
                onClick={() => setPowerProductRegions([])}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  powerProductRegions.length === 0
                    ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-100"
                    : "border-gray-800 bg-black/20 text-gray-400 hover:border-gray-600"
                }`}
              >
                All
              </button>
              {powerRegionOptions.map((region) => {
                const active = powerProductRegions.includes(region);
                return (
                  <button
                    key={region}
                    type="button"
                    onClick={() =>
                      setPowerProductRegions(
                        active
                          ? powerProductRegions.filter((value) => value !== region)
                          : [...powerProductRegions, region],
                      )
                    }
                    className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-100"
                        : "border-gray-800 bg-black/20 text-gray-400 hover:border-gray-600"
                    }`}
                  >
                    {region}
                  </button>
                );
              })}
            </div>
          )}
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
            className="h-10 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-4 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/20"
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
            title="Excel download is not wired yet."
            className="h-10 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-4 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/20"
          >
            Download Excel
          </button>
          <button
            type="button"
            title="Power RT Excel export is not wired yet."
            className="h-10 rounded-md border border-amber-500/60 bg-amber-500/10 px-4 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-500/20"
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
      <div className={`mt-3 rounded-md border px-3 py-2 ${status.className}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
          <span className="text-[10px] font-black uppercase tracking-wide">
            {status.label}
          </span>
          {visibleMetrics.map((metric, index) => (
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
      className={`px-3 py-2 text-right tabular-nums ${valueClass(cell.quantity)}`}
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
      className="border-r border-gray-800 px-3 py-2 text-center"
    >
      {account.label}
    </th>
  );
}

function GasFuturesMatrix({ payload }: { payload: BackOfficeNavDailyPositionSheetPayload }) {
  const { accountColumns, productCodes, rows } = payload.gasFutures;
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950/80">
      <div className="overflow-x-auto">
        <table className="min-w-[1500px] border-collapse text-sm">
          <thead className="text-xs font-bold uppercase tracking-[0.3px] text-gray-300 [&_tr:nth-child(2)_th]:text-gray-400">
            <tr>
              <th className="sticky left-0 z-20 border-r border-gray-800 bg-black px-3 py-2 text-left">
                YYYYMM
              </th>
              {accountColumns.map((account) => (
                <AccountHeader key={account.key} account={account} />
              ))}
              <th
                rowSpan={2}
                className="border-l border-gray-800 px-3 py-2 text-right"
              >
                All Total
              </th>
            </tr>
            <tr>
              <th className="sticky left-0 z-20 border-r border-gray-800 bg-black px-3 py-2">
                &nbsp;
              </th>
              {accountColumns.flatMap((account) => [
                ...productCodes.map((productCode) => (
                  <th
                    key={`${account.key}:${productCode}`}
                    className="border-l border-gray-900 px-3 py-2 text-right"
                  >
                    {productCode}
                  </th>
                )),
                <th
                  key={`${account.key}:total`}
                  className="border-l border-gray-700 bg-gray-900 px-3 py-2 text-right"
                >
                  Total
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.yyyymm} className="border-t border-gray-900 odd:bg-gray-900/35 even:bg-gray-950">
                <td className="sticky left-0 z-10 border-r border-gray-800 bg-inherit px-3 py-2 font-bold text-gray-200">
                  {row.yyyymm}
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
                    className={`border-l border-gray-800 bg-gray-900/50 px-3 py-2 text-right font-bold tabular-nums ${valueClass(row.accountTotals[account.key] ?? 0)}`}
                  >
                    {fmtNumber(row.accountTotals[account.key] ?? 0)}
                  </td>,
                ])}
                <td
                  className={`border-l border-gray-700 bg-gray-900 px-3 py-2 text-right font-black tabular-nums ${valueClass(row.total)}`}
                >
                  {fmtNumber(row.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PowerMatrixCell({ cell }: { cell: BackOfficeNavDailyPositionSheetPowerCell | undefined }) {
  const nextCell = cell ?? { quantity: 0, rawQuantity: 0, multiplier: null };
  return (
    <td
      className={`min-w-[82px] border-l border-gray-900 px-3 py-3 text-right text-xs font-bold tabular-nums ${valueClass(nextCell.quantity)}`}
      title={powerCellTitle(nextCell)}
    >
      {fmtNumber(nextCell.quantity)}
    </td>
  );
}

function powerRegionBandClass(regionLabel: string): string {
  if (regionLabel === "PJM") return "bg-[#0d1b31] text-sky-100";
  if (regionLabel === "ERCOT") return "bg-[#211a11] text-amber-100";
  if (regionLabel === "WEST") return "bg-[#052725] text-emerald-100";
  return "bg-gray-900 text-gray-200";
}

function PowerFuturesTable({
  title,
  section,
}: {
  title: string;
  section: BackOfficeNavDailyPositionSheetPowerFuturesSection;
}) {
  const colSpan = Math.max(section.columns.length + 1, 2);
  const minWidth = section.columns.length > 0 ? 180 + section.columns.length * 84 : 900;
  let previousRegion = "";

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950/80">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h3 className="text-sm font-bold text-gray-100">{title}</h3>
        <p className="text-xs text-gray-500">
          {fmtNumber(section.productCount, false)} products | {fmtNumber(section.dateCount, false)} dates |{" "}
          {section.unitLabel}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs" style={{ minWidth }}>
          <thead className="bg-black text-[11px] font-bold uppercase text-gray-400">
            <tr>
              <th className="sticky left-0 z-20 min-w-[180px] border-r border-gray-800 bg-black px-3 py-3 text-left text-cyan-100">
                Product
              </th>
              {section.columns.length === 0 ? (
                <th
                  className="min-w-[190px] border-l border-gray-800 bg-gray-900 px-3 py-3 text-right text-gray-400"
                >
                  Total
                </th>
              ) : (
                section.columns.map((column) => (
                  <th key={column.key} className="min-w-[82px] border-l border-gray-900 px-3 py-2 text-right">
                    <span className="block text-gray-200">{column.label}</span>
                    <span className="block text-[9px] text-gray-600">{column.subLabel}</span>
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {section.rows.length === 0 ? (
              <tr className="border-t border-gray-900 bg-gray-950">
                <td colSpan={colSpan} className="px-3 py-8 text-center text-sm text-gray-500">
                  No active rows for this section.
                </td>
              </tr>
            ) : (
              <>
                {section.rows.map((row) => {
                  const showRegion = row.regionLabel !== previousRegion;
                  previousRegion = row.regionLabel;
                  return (
                    <Fragment key={`${row.regionLabel}:${row.productCode}`}>
                      {showRegion && (
                        <tr className={`border-t border-gray-800 ${powerRegionBandClass(row.regionLabel)}`}>
                          <td colSpan={colSpan} className="px-3 py-2 text-xs font-black uppercase">
                            {row.regionLabel}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-gray-900 bg-[#090f18]">
                        <td className="sticky left-0 z-10 border-r border-gray-800 bg-inherit px-3 py-3">
                          <p className="text-xs font-black uppercase text-cyan-100">{row.productLabel}</p>
                          <p className="mt-0.5 text-[10px] font-semibold text-gray-600">
                            {row.productCode} {row.unitLabel}
                          </p>
                        </td>
                        {section.columns.map((column) => (
                          <PowerMatrixCell key={`${row.productCode}:${column.key}`} cell={row.values[column.key]} />
                        ))}
                      </tr>
                    </Fragment>
                  );
                })}
                <tr className="border-t border-gray-700 bg-black">
                  <td className="sticky left-0 z-10 border-r border-gray-800 bg-black px-3 py-2 text-xs font-black uppercase text-gray-100">
                    Net Total
                  </td>
                  {section.columns.map((column) => (
                    <td
                      key={`total:${column.key}`}
                      className={`min-w-[82px] border-l border-gray-900 px-3 py-2 text-right text-xs font-black tabular-nums ${valueClass(
                        section.totals[column.key] ?? 0,
                      )}`}
                    >
                      {fmtNumber(section.totals[column.key] ?? 0)}
                    </td>
                  ))}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PowerPositionsMatrix({
  payload,
  setOptionMonth,
  detailLoading,
  detailError,
}: {
  payload: BackOfficeNavDailyPositionSheetPayload;
  setOptionMonth: (value: string) => void;
  detailLoading?: boolean;
  detailError?: string | null;
}) {
  return (
    <div className="space-y-4">
      <PowerFuturesTable title="Daily Power Futures" section={payload.powerFutures.daily} />
      <PowerFuturesTable title="Monthly Power Futures" section={payload.powerFutures.monthly} />
      <OptionsLadder
        title="Power Options Ladder"
        description="Active power strike ladder using raw lots. Expired option rows are retained in the Excel audit tab."
        quantityLabel="Raw lots"
        priceDigits={3}
        fixedPrice
        months={payload.powerOptionMonths}
        summary={payload.powerOptionSummary}
        rows={payload.powerOptionRows}
        setOptionMonth={setOptionMonth}
        detailLoading={detailLoading}
        detailError={detailError}
      />
    </div>
  );
}

function optionMonthLongLabel(yyyymm: string | null | undefined): string {
  if (!yyyymm || yyyymm.length !== 6) return "--";
  const year = Number.parseInt(yyyymm.slice(0, 4), 10);
  const month = Number.parseInt(yyyymm.slice(4, 6), 10);
  if (!year || !month) return yyyymm;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    year: "numeric",
  });
}

function topAccountClass(value: string | null): string {
  if (!value) return "text-gray-700";
  const match = value.match(/(-?[\d,]+(?:\.\d+)?)$/);
  if (!match) return "text-gray-300";
  return valueClass(Number.parseFloat(match[1].replace(/,/g, "")));
}

const OPTION_MONTH_CODES = ["F", "G", "H", "J", "K", "M", "N", "Q", "U", "V", "X", "Z"];

function optionRowKey(row: BackOfficeNavDailyPositionSheetOptionRow): string {
  return `${row.exchange}:${row.strike}`;
}

function optionSide(row: BackOfficeNavDailyPositionSheetOptionRow): "PUT" | "CALL" {
  return Math.abs(row.putQuantity) >= Math.abs(row.callQuantity) ? "PUT" : "CALL";
}

function optionContractCode(yyyymm: string | null | undefined): string {
  if (!yyyymm || yyyymm.length !== 6) return "--";
  const month = Number.parseInt(yyyymm.slice(4, 6), 10);
  const yearDigit = yyyymm.slice(3, 4);
  return `${OPTION_MONTH_CODES[month - 1] ?? ""}${yearDigit || ""}` || "--";
}

function optionSettle(row: BackOfficeNavDailyPositionSheetOptionRow): number | null {
  return optionSide(row) === "PUT" ? row.putSettle : row.callSettle;
}

function OptionStat({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: string;
  detail?: string;
  className: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-black/20 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${className}`}>{value}</p>
      {detail && <p className="text-xs text-gray-500">{detail}</p>}
    </div>
  );
}

function OptionAccountsDetail({
  row,
  selectedMonth,
  quantityLabel = "Gas qty",
  priceDigits = 4,
  fixedPrice = false,
}: {
  row: BackOfficeNavDailyPositionSheetOptionRow;
  selectedMonth: string | null;
  quantityLabel?: string;
  priceDigits?: number;
  fixedPrice?: boolean;
}) {
  const side = optionSide(row);
  const settle = optionSettle(row);

  return (
    <tr className="bg-gray-950">
      <td colSpan={12} className="px-3 py-4">
        {row.accounts.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-4">
            {row.accounts.map((account) => (
              <div
                key={`${optionRowKey(row)}:${account.account}`}
                className="rounded-lg border border-gray-800 bg-black/20 p-3"
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{account.account}</p>
                <p className={`mt-2 text-lg font-bold tabular-nums ${valueClass(account.quantity)}`}>
                  {fmtNumber(account.quantity, false)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-gray-800 bg-black/20 p-3 text-xs text-gray-500">
            No account-level quantities available for this strike.
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-800 bg-gray-900/40 p-3">
          <div>
            <p className="text-xs font-bold uppercase text-gray-100">
              {side} {optionMonthLongLabel(selectedMonth)} {fmtNumber(row.strike, false)}
            </p>
            <p className="mt-2 text-xs text-gray-500">
              {optionContractCode(selectedMonth)} | {quantityLabel} {fmtNumber(row.netQuantity, false)} | Settle{" "}
              {fmtPrice(settle, priceDigits, fixedPrice)} | P&amp;L {fmtNumber(row.settlePnl, false)}
            </p>
          </div>
          <span className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-300">{row.exchange}</span>
        </div>
      </td>
    </tr>
  );
}

function OptionsLadder({
  title = "Gas Options Ladder",
  description = "Active exchange-aware strike ladder using gas-equivalent quantity. Expired option rows are retained in the Excel audit tab.",
  quantityLabel = "Gas qty",
  priceDigits = 4,
  fixedPrice = false,
  months,
  summary,
  rows,
  setOptionMonth,
  detailLoading = false,
  detailError = null,
}: {
  title?: string;
  description?: string;
  quantityLabel?: string;
  priceDigits?: number;
  fixedPrice?: boolean;
  months: BackOfficeNavDailyPositionSheetPayload["optionMonths"];
  summary: BackOfficeNavDailyPositionSheetPayload["optionSummary"];
  rows: BackOfficeNavDailyPositionSheetOptionRow[];
  setOptionMonth: (value: string) => void;
  detailLoading?: boolean;
  detailError?: string | null;
}) {
  const [expandedOptionRowKey, setExpandedOptionRowKey] = useState<string | null>(null);
  const detailPending = detailLoading && !summary.detailLoaded;
  const detailUnavailable = Boolean(detailError) && !summary.detailLoaded;
  const detailRowText = detailPending
    ? "Loading detail"
    : detailUnavailable
      ? "Summary only"
      : `${fmtNumber(summary.selectedMonthRowCount, false)} option rows`;
  const detailValue = (value: number, emptyZero = true) =>
    summary.detailLoaded ? fmtNumber(value, emptyZero) : detailPending ? "Loading" : "-";

  useEffect(() => {
    setExpandedOptionRowKey(null);
  }, [summary.selectedMonth]);

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950/80 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-100">{title}</p>
          <p className="mt-1 text-xs text-gray-500">{description}</p>
        </div>
        <p className="text-xs text-gray-500">
          {fmtNumber(summary.activeRows, false)} active rows |{" "}
          {fmtNumber(summary.expiredHidden, false)} expired hidden
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {months.map((month) => {
          const active = month.yyyymm === summary.selectedMonth;
          return (
            <button
              key={month.yyyymm}
              type="button"
              onClick={() => setOptionMonth(month.yyyymm)}
              className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                active
                  ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-100"
                  : "border-gray-800 bg-black/20 text-gray-400 hover:border-gray-600"
              }`}
            >
              <span className="block font-bold">{optionMonthLongLabel(month.yyyymm)}</span>
              <span className="block text-[10px] text-gray-500">{month.yyyymm}</span>
              <span className={`block tabular-nums ${valueClass(month.netQuantity)}`}>
                Net {fmtNumber(month.netQuantity)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <OptionStat
          label="Selected Month"
          value={optionMonthLongLabel(summary.selectedMonth)}
          detail={detailRowText}
          className="text-gray-100"
        />
        <OptionStat
          label="Put Qty"
          value={detailValue(summary.putQuantity)}
          className={valueClass(summary.putQuantity)}
        />
        <OptionStat
          label="Call Qty"
          value={detailValue(summary.callQuantity, false)}
          className={valueClass(summary.callQuantity)}
        />
        <OptionStat
          label="Net P&L"
          value={detailValue(summary.settlePnl, false)}
          className={valueClass(summary.settlePnl)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1200px] text-xs">
          <thead className="bg-black text-gray-400">
            <tr>
              <th className="px-2 py-2 font-semibold text-left">Exchange</th>
              <th className="px-2 py-2 font-semibold text-right">Strike</th>
              <th className="px-2 py-2 font-semibold text-right">Put Qty</th>
              <th className="px-2 py-2 font-semibold text-right">Call Qty</th>
              <th className="px-2 py-2 font-semibold text-right">Net Qty</th>
              <th className="px-2 py-2 font-semibold text-right">Put Settle</th>
              <th className="px-2 py-2 font-semibold text-right">Call Settle</th>
              <th className="px-2 py-2 font-semibold text-right">Put Chg</th>
              <th className="px-2 py-2 font-semibold text-right">Call Chg</th>
              <th className="px-2 py-2 font-semibold text-right">Settle P&amp;L</th>
              <th className="px-2 py-2 font-semibold text-left">Top Account</th>
              <th className="px-2 py-2 font-semibold text-left">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-gray-900 odd:bg-gray-900/35 even:bg-gray-950">
                <td colSpan={12} className="px-2 py-3 text-gray-500">
                  {detailPending
                    ? "Loading option detail..."
                    : detailUnavailable
                      ? "Option detail failed; showing summary only."
                      : "No active rows for this month."}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const rowKey = optionRowKey(row);
                const expanded = expandedOptionRowKey === rowKey;

                return (
                  <Fragment key={rowKey}>
                    <tr className="border-t border-gray-900 odd:bg-gray-900/35 even:bg-gray-950">
                      <td className="px-2 py-2 text-left font-bold text-gray-100">{row.exchange}</td>
                      <td className="px-2 py-2 text-right font-bold tabular-nums text-gray-100">
                        {fmtNumber(row.strike, false)}
                      </td>
                      <td
                        className={`px-2 py-2 text-right font-semibold tabular-nums ${valueClass(row.putQuantity)}`}
                      >
                        {fmtNumber(row.putQuantity)}
                      </td>
                      <td
                        className={`px-2 py-2 text-right font-semibold tabular-nums ${valueClass(row.callQuantity)}`}
                      >
                        {fmtNumber(row.callQuantity)}
                      </td>
                      <td
                        className={`border-l border-gray-800 px-2 py-2 text-right font-black tabular-nums ${valueClass(
                          row.netQuantity,
                        )}`}
                      >
                        {fmtNumber(row.netQuantity, false)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-300">
                        {fmtPrice(row.putSettle, priceDigits, fixedPrice)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-300">
                        {fmtPrice(row.callSettle, priceDigits, fixedPrice)}
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums ${valueClass(row.putChange ?? 0)}`}>
                        {fmtPrice(row.putChange, priceDigits, fixedPrice)}
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums ${valueClass(row.callChange ?? 0)}`}>
                        {fmtPrice(row.callChange, priceDigits, fixedPrice)}
                      </td>
                      <td
                        className={`px-2 py-2 text-right font-semibold tabular-nums ${valueClass(row.settlePnl)}`}
                      >
                        {fmtNumber(row.settlePnl, false)}
                      </td>
                      <td className={`px-2 py-2 font-semibold ${topAccountClass(row.topAccount)}`}>
                        {row.topAccount ?? "-"}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => setExpandedOptionRowKey(expanded ? null : rowKey)}
                          className="rounded border border-gray-700 px-2 py-1 text-[11px] font-semibold text-gray-300 hover:border-cyan-500/50 hover:text-cyan-100"
                        >
                          {expanded ? "Hide" : "Accounts"}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <OptionAccountsDetail
                        row={row}
                        selectedMonth={summary.selectedMonth}
                        quantityLabel={quantityLabel}
                        priceDigits={priceDigits}
                        fixedPrice={fixedPrice}
                      />
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function BackOfficeNavDailyPositionSheet() {
  const [payload, setPayload] = useState<BackOfficeNavDailyPositionSheetPayload | null>(null);
  const [activePositionView, setActivePositionView] = useState<ActivePositionView>("gas");
  const [selectedDate, setSelectedDate] = useState("");
  const [optionMonth, setOptionMonth] = useState("");
  const [powerProductRegions, setPowerProductRegions] = useState<string[]>(DEFAULT_POWER_PRODUCT_REGION_FILTERS);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [optionDetailLoading, setOptionDetailLoading] = useState(false);
  const [optionDetailError, setOptionDetailError] = useState<string | null>(null);

  const url = useMemo(
    () => apiUrl(selectedDate, optionMonth, activePositionView, powerProductRegions, refreshNonce),
    [activePositionView, optionMonth, powerProductRegions, refreshNonce, selectedDate],
  );

  useEffect(() => {
    let active = true;
    const forceRefresh = refreshNonce > 0;

    setLoading(true);
    setError(null);
    setOptionDetailError(null);

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

  useEffect(() => {
    if (!payload) return;
    const summary = activePositionView === "gas" ? payload.optionSummary : payload.powerOptionSummary;
    const selectedOptionMonth = summary.selectedMonth;
    if (!selectedOptionMonth || summary.detailLoaded) {
      setOptionDetailLoading(false);
      setOptionDetailError(null);
      return;
    }

    let active = true;
    const forceRefresh = refreshNonce > 0;
    const detailUrl = optionDetailUrl(
      selectedDate || payload.selectedDate || "",
      selectedOptionMonth,
      activePositionView,
      powerProductRegions,
      refreshNonce,
    );

    setOptionDetailLoading(true);
    setOptionDetailError(null);

    fetchJsonWithCache<BackOfficeNavDailyPositionSheetOptionDetailPayload>({
      key: `backoffice-nav-daily-position-sheet-option-detail:${detailUrl}`,
      url: detailUrl,
      ttlMs: API_CACHE_TTL_MS,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
      persist: "session",
    })
      .then((detail) => {
        if (!active) return;
        setPayload((current) => (current ? mergeOptionDetailPayload(current, detail) : current));
      })
      .catch((err: Error) => {
        if (!active) return;
        setOptionDetailError(err.message || "Failed to load option detail");
      })
      .finally(() => {
        if (active) setOptionDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    activePositionView,
    payload,
    powerProductRegions,
    refreshNonce,
    selectedDate,
  ]);

  if (loading && !payload) return <LoadingState />;
  if (error && !payload) {
    return <ErrorState error={error} onRetry={() => setRefreshNonce((value) => value + 1)} />;
  }
  if (!payload) return null;

  return (
    <div className="space-y-4" data-perf-ready="backoffice-nav-daily-position-sheet">
      {error && (
        <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-200">
          Refresh failed; showing cached data. {error}
        </div>
      )}

      <HeaderPanel
        payload={payload}
        activePositionView={activePositionView}
        setActivePositionView={(value) => {
          setActivePositionView(value);
          setOptionMonth("");
        }}
        powerProductRegions={powerProductRegions}
        setPowerProductRegions={(value) => {
          setPowerProductRegions(value);
          setOptionMonth("");
        }}
        selectedDate={selectedDate || payload.selectedDate || ""}
        setSelectedDate={(value) => {
          setSelectedDate(value);
          setOptionMonth("");
        }}
        refresh={() => setRefreshNonce((value) => value + 1)}
      />
      {activePositionView === "gas" ? (
        <>
          <GasFuturesMatrix payload={payload} />
          <OptionsLadder
            months={payload.optionMonths}
            summary={payload.optionSummary}
            rows={payload.optionRows}
            setOptionMonth={setOptionMonth}
            detailLoading={activePositionView === "gas" && optionDetailLoading}
            detailError={activePositionView === "gas" ? optionDetailError : null}
          />
        </>
      ) : (
        <PowerPositionsMatrix
          payload={payload}
          setOptionMonth={setOptionMonth}
          detailLoading={activePositionView === "power" && optionDetailLoading}
          detailError={activePositionView === "power" ? optionDetailError : null}
        />
      )}
    </div>
  );
}
