"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ColumnVisibilityPopover from "@/components/dashboard/ColumnVisibilityPopover";
import DataTableShell from "@/components/dashboard/DataTableShell";
import {
  formatIceTradeProductDisplay,
  iceTradeProductDisplaySortKey,
} from "@/lib/iceTradeProductDisplay";
import { type IceTradeProductScope } from "@/lib/iceTradeBlotterRules";

export interface ProductDictionaryRow {
  cc: string;
  blotter_cc: string;
  asset_class: string;
  region: string;
  product_group: string;
  ice_symbol_pattern: string;
  product_name: string;
  market: string;
  hub: string;
  blotter_hub_aliases: string;
  pjm_pnode_name: string;
  contract_family: string;
  contract_code: string;
  contract_label: string;
  hour_bucket: string;
  shape: string;
  ice_product_type: string;
  settlement_source: string;
  settlement_source_key: string;
  settlement_priority: number | string;
  active: boolean;
  ice_product_id: string | null;
  ice_product_url: string | null;
  ice_product_title: string | null;
  ice_contract_symbol: string | null;
  ice_contract_size: string | null;
  ice_trading_screen_product_name: string | null;
  ice_trading_screen_hub_name: string | null;
  ice_reference_price: string | null;
  ice_specified_price: string | null;
  ice_metadata_status: string;
  notes: string;
}

export interface ProductDictionaryPayload {
  scope?: IceTradeProductScope;
  rowCount: number;
  summary: {
    rowCount: number;
    activeRowCount: number;
    pjmRowCount: number;
    iceRowCount: number;
    optionRowCount: number;
    assetClassCounts: Record<string, number>;
    regionCounts: Record<string, number>;
    groupCounts: Record<string, number>;
  };
  rows: ProductDictionaryRow[];
}

type SortDirection = "asc" | "desc";
type SourceNoteTone = "info" | "settled" | "pending" | "overdue" | "partial" | "unknown";

type ProductDictionaryColumnKey =
  | "source_note"
  | "asset_class"
  | "region"
  | "product_group"
  | "cc"
  | "blotter_cc"
  | "ice_symbol_pattern"
  | "product_name"
  | "market"
  | "hub"
  | "blotter_hub_aliases"
  | "pjm_pnode_name"
  | "contract_family"
  | "contract_code"
  | "contract_label"
  | "hour_bucket"
  | "shape"
  | "ice_product_type"
  | "settlement_source"
  | "settlement_source_key"
  | "settlement_priority"
  | "active"
  | "ice_product_id"
  | "ice_product_url"
  | "ice_product_title"
  | "ice_contract_symbol"
  | "ice_contract_size"
  | "ice_trading_screen_product_name"
  | "ice_trading_screen_hub_name"
  | "ice_reference_price"
  | "ice_specified_price"
  | "ice_metadata_status"
  | "notes";

interface ProductDictionarySortState {
  key: ProductDictionaryColumnKey;
  direction: SortDirection;
}

type ProductDictionaryColumnFilters = Partial<Record<ProductDictionaryColumnKey, string[]>>;

interface SourceNoteLine {
  label: string;
  value: string;
}

interface ProductDictionaryCellCoordinate {
  rowIndex: number;
  columnIndex: number;
  rowKey: string;
  columnKey: ProductDictionaryColumnKey;
}

interface ProductDictionaryColumnDefinition {
  key: ProductDictionaryColumnKey;
  label: string;
  align?: "left" | "right";
  minClass?: string;
  render: (row: ProductDictionaryRow) => React.ReactNode;
}

const EMPTY_FILTER_VALUES: string[] = [];

const SOURCE_NOTE_TONE_CLASSES: Record<SourceNoteTone, string> = {
  info: "border-sky-500/40 bg-sky-500/10 text-sky-100 hover:border-sky-300/70 hover:bg-sky-500/20 focus:border-sky-300/70 focus:bg-sky-500/20",
  settled: "border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:border-emerald-300/80 hover:bg-emerald-500/25 focus:border-emerald-300/80 focus:bg-emerald-500/25",
  pending: "border-amber-500/50 bg-amber-500/15 text-amber-100 hover:border-amber-300/80 hover:bg-amber-500/25 focus:border-amber-300/80 focus:bg-amber-500/25",
  overdue: "border-rose-500/50 bg-rose-500/15 text-rose-100 hover:border-rose-300/80 hover:bg-rose-500/25 focus:border-rose-300/80 focus:bg-rose-500/25",
  partial: "border-orange-500/50 bg-orange-500/15 text-orange-100 hover:border-orange-300/80 hover:bg-orange-500/25 focus:border-orange-300/80 focus:bg-orange-500/25",
  unknown: "border-gray-600 bg-gray-800 text-gray-200 hover:border-gray-400 hover:bg-gray-700 focus:border-gray-400 focus:bg-gray-700",
};

const PRODUCT_CONTRACT_TYPE_SORT_ORDER: Record<string, number> = {
  Daily: 1,
  Weekly: 2,
  Monthly: 3,
};

const PRODUCT_SETTLEMENT_SOURCE_SORT_ORDER: Record<string, number> = {
  PJM_DA_LMP: 1,
  PJM_RT_LMP: 2,
  ERCOT_DA_LMP: 3,
  ERCOT_RT_LMP: 4,
  ICE_SETTLEMENT: 5,
};

const PRODUCT_CONTRACT_CODE_SORT_ORDER: Record<string, number> = {
  D0: 1,
  D1: 2,
  W0: 3,
  P1: 4,
  W1: 5,
  W2: 6,
  W3: 7,
  W4: 8,
};

const DEFAULT_PRODUCT_DICTIONARY_SORT_STATE: ProductDictionarySortState = {
  key: "cc",
  direction: "asc",
};

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function fmtText(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "--";
  return String(value);
}

function fmtNumber(value: number | string | null | undefined, fractionDigits = 0): string {
  const numberValue = toFiniteNumber(value);
  if (numberValue === null) return "--";
  return numberValue.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function sortFilterOption(first: string, second: string): number {
  return first.localeCompare(second, undefined, { numeric: true, sensitivity: "base" });
}

function hourBucketNote(hourBucket: string | null | undefined): string {
  if (hourBucket === "ONPEAK") {
    return "OnPeak hours are defined by the ISO/product contract.";
  }
  if (hourBucket === "OFFPEAK") {
    return "OffPeak hours are defined by the ISO/product contract.";
  }
  return "Determined by the ICE contract.";
}

function settleSourceNote(source: string): string {
  if (source === "PJM_DA_LMP") return "pjm.da_hrl_lmps";
  if (source === "PJM_RT_LMP") {
    return "pjm.rt_settlements_verified_hourly_lmps, fallback pjm.rt_unverified_hourly_lmps";
  }
  if (source === "ERCOT_DA_LMP") return "ercot.dam_stlmnt_pnt_prices";
  if (source === "ERCOT_RT_LMP") return "ercot.rt_spp_all_nodes";
  if (source === "ICE_SETTLEMENT") return "ice_python.settlements";
  return source || "--";
}

function productDictionarySourceNote(row: ProductDictionaryRow): SourceNoteLine[] {
  const stats =
    row.settlement_source === "ICE_SETTLEMENT"
      ? "ICE futures and market stats use ice_python.settlements"
      : "ice_python.settlements by trade date and ICE symbol";
  const hub =
    row.settlement_source === "PJM_DA_LMP" ||
      row.settlement_source === "PJM_RT_LMP" ||
      row.settlement_source === "ERCOT_DA_LMP" ||
      row.settlement_source === "ERCOT_RT_LMP"
      ? row.ice_trading_screen_hub_name || row.pjm_pnode_name || row.hub || "--"
      : row.ice_trading_screen_hub_name || row.hub || "--";
  return [
    { label: "Asset", value: fmtText(row.asset_class) },
    { label: "Region", value: fmtText(row.region) },
    { label: "Settle", value: settleSourceNote(row.settlement_source) },
    { label: "Stats", value: stats },
    { label: "ICE", value: row.ice_product_title || row.ice_product_url || "--" },
    { label: "Type", value: row.ice_product_type || row.contract_family || "--" },
    { label: "Shape", value: row.shape || "--" },
    { label: "Size", value: row.ice_contract_size || "--" },
    { label: "Hub", value: hub },
    { label: "Hours", value: hourBucketNote(row.hour_bucket) },
    { label: "Delivery", value: "ice_python.settlement_contract_dates" },
  ];
}

function productContractSortValue(row: ProductDictionaryRow): number {
  const explicitCode = String(row.contract_code ?? "").trim().toUpperCase();
  const symbolCode = String(row.ice_symbol_pattern ?? "")
    .match(/\b(D0|D1|W0|P1|W1|W2|W3|W4)\b/i)?.[1]
    ?.toUpperCase();
  const code = explicitCode || symbolCode || "";
  const codeSort = PRODUCT_CONTRACT_CODE_SORT_ORDER[code];
  if (codeSort !== undefined) return codeSort;

  const label = `${row.contract_label ?? ""} ${row.ice_symbol_pattern ?? ""}`.toLowerCase();
  if (label.includes("bal day") || label.includes("balance of day")) return 1;
  if (label.includes("next day")) return 2;
  if (label.includes("bal week") || label.includes("balance of week")) return 3;
  if (label.includes("weekend")) return 4;
  if (label.includes("next week") || label.includes("week 1")) return 5;
  if (label.includes("2nd week") || label.includes("second week") || label.includes("week 2")) return 6;
  if (label.includes("3rd week") || label.includes("third week") || label.includes("week 3")) return 7;
  if (label.includes("4th week") || label.includes("fourth week") || label.includes("week 4")) return 8;

  return 99 + (PRODUCT_CONTRACT_TYPE_SORT_ORDER[row.contract_family] ?? 99);
}

function productDictionaryDisplayName(row: ProductDictionaryRow): string {
  return formatIceTradeProductDisplay({
    cc: row.cc,
    blotterCc: row.blotter_cc,
    hub: row.hub,
    iceTradingScreenHubName: row.ice_trading_screen_hub_name,
    market: row.market,
    shape: row.shape,
    iceContractSize: row.ice_contract_size,
    contractCode: row.contract_code,
    contractLabel: row.contract_label,
  });
}

function productDictionaryDisplaySortKey(row: ProductDictionaryRow): number {
  return iceTradeProductDisplaySortKey({
    cc: row.cc,
    blotterCc: row.blotter_cc,
    hub: row.hub,
    iceTradingScreenHubName: row.ice_trading_screen_hub_name,
    market: row.market,
    shape: row.shape,
    iceContractSize: row.ice_contract_size,
    contractCode: row.contract_code,
    contractLabel: row.contract_label,
  });
}

function SourceNoteIcon({
  lines,
  tone = "info",
  glyph = "i",
}: {
  lines: SourceNoteLine[];
  tone?: SourceNoteTone;
  glyph?: string;
}) {
  const note = lines.map((line) => `${line.label}: ${line.value}`).join(" ");
  const iconRef = useRef<HTMLSpanElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const tooltipWidth = 420;
  const tooltipHeight = Math.min(360, Math.max(120, lines.length * 28 + 24));

  const showTooltip = () => {
    const rect = iconRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 12;
    const maxLeft = Math.max(margin, window.innerWidth - tooltipWidth - margin);
    const left = Math.min(Math.max(rect.left, margin), maxLeft);
    const hasRoomBelow = rect.bottom + tooltipHeight + margin <= window.innerHeight;
    const top = hasRoomBelow ? rect.bottom + 6 : Math.max(margin, rect.top - tooltipHeight - 6);
    setTooltipPosition({ top, left });
  };

  const hideTooltip = () => setTooltipPosition(null);
  const tooltip = tooltipPosition
    ? createPortal(
        <span
          className="fixed z-[1000] max-h-[360px] w-[420px] max-w-[calc(100vw-1.5rem)] overflow-auto rounded-md border border-sky-500/40 bg-gray-950 px-3 py-2 text-left text-[11px] font-normal leading-5 text-sky-50 shadow-xl shadow-black/40"
          style={{ top: tooltipPosition.top, left: tooltipPosition.left }}
        >
          <span className="grid gap-1.5">
            {lines.map((line) => (
              <span key={line.label} className="grid grid-cols-[92px_1fr] gap-2">
                <span className="font-semibold uppercase tracking-wide text-sky-300">
                  {line.label}
                </span>
                <span className="text-gray-100">{line.value}</span>
              </span>
            ))}
          </span>
        </span>,
        document.body
      )
    : null;

  return (
    <span className="relative inline-flex" onMouseLeave={hideTooltip}>
      <span
        ref={iconRef}
        role="img"
        aria-label={note}
        tabIndex={0}
        onMouseEnter={showTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        className={`inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border text-[10px] font-bold outline-none transition-colors ${SOURCE_NOTE_TONE_CLASSES[tone]}`}
      >
        {glyph}
      </span>
      {tooltip}
    </span>
  );
}

function ColumnFilterMenu({
  label,
  options,
  selected,
  sortDirection,
  onSort,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  sortDirection: SortDirection | null;
  onSort: (direction: SortDirection) => void;
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draftSelected, setDraftSelected] = useState<string[]>(selected);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    setDraftSelected(selected);
    setQuery("");
  }, [open, selected]);

  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    const updateMenuPosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 256;
      const margin = 8;
      const left = Math.min(Math.max(rect.left, margin), window.innerWidth - menuWidth - margin);
      setMenuPosition({ left, top: rect.bottom + 4 });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(query.trim().toLowerCase())
  );
  const active = selected.length > 0;

  const toggleValue = (value: string) => {
    setDraftSelected((values) =>
      values.includes(value)
        ? values.filter((candidate) => candidate !== value)
        : [...values, value]
    );
  };

  const menu =
    open && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[1000] w-64 rounded-lg border border-gray-700 bg-gray-950 p-2 text-xs text-gray-200 shadow-xl shadow-black/40"
            style={{ left: menuPosition.left, top: menuPosition.top }}
          >
            <div className="mb-2 flex items-center gap-2 border-b border-gray-800 pb-2">
              <button
                type="button"
                onClick={() => onSort("asc")}
                className={`rounded border px-2 py-1 ${
                  sortDirection === "asc"
                    ? "border-sky-500 bg-sky-500/10 text-sky-200"
                    : "border-gray-800 bg-gray-900 text-gray-400"
                }`}
              >
                Asc
              </button>
              <button
                type="button"
                onClick={() => onSort("desc")}
                className={`rounded border px-2 py-1 ${
                  sortDirection === "desc"
                    ? "border-sky-500 bg-sky-500/10 text-sky-200"
                    : "border-gray-800 bg-gray-900 text-gray-400"
                }`}
              >
                Desc
              </button>
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Filter ${label}`}
              className="mb-2 w-full rounded border border-gray-800 bg-gray-900 px-2 py-1 text-xs text-gray-100 outline-none placeholder:text-gray-600 focus:border-sky-500/60"
            />
            <div className="max-h-52 overflow-auto pr-1">
              {filteredOptions.length === 0 ? (
                <div className="px-2 py-4 text-center text-gray-600">No values</div>
              ) : (
                filteredOptions.map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-900"
                  >
                    <input
                      type="checkbox"
                      checked={draftSelected.includes(option)}
                      onChange={() => toggleValue(option)}
                      className="h-3.5 w-3.5 rounded border-gray-700 bg-gray-900"
                    />
                    <span className="min-w-0 truncate">{option}</span>
                  </label>
                ))
              )}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-gray-800 pt-2">
              <button
                type="button"
                onClick={() => setDraftSelected([])}
                className="rounded px-2 py-1 text-gray-500 hover:bg-gray-900 hover:text-gray-300"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(draftSelected);
                  setOpen(false);
                }}
                className="rounded border border-sky-500/40 bg-sky-500/10 px-2 py-1 font-semibold text-sky-100 hover:bg-sky-500/20"
              >
                Apply
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Filter ${label}`}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-6 w-6 items-center justify-center rounded border text-[10px] transition-colors ${
          active
            ? "border-sky-500/60 bg-sky-500/15 text-sky-200"
            : "border-gray-800 bg-gray-950 text-gray-500 hover:border-gray-700 hover:text-gray-300"
        }`}
      >
        {active ? selected.length : "F"}
      </button>
      {menu}
    </>
  );
}

function IceProductLink({ row }: { row: ProductDictionaryRow }) {
  if (!row.ice_product_url) return <span className="text-gray-600">--</span>;
  return (
    <a
      href={row.ice_product_url}
      target="_blank"
      rel="noreferrer"
      title={row.ice_product_title ?? row.ice_product_url}
      className="rounded border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-100 transition-colors hover:border-sky-300/70 hover:bg-sky-500/20"
    >
      ICE
    </a>
  );
}

const PRODUCT_DICTIONARY_COLUMN_DEFINITIONS: ProductDictionaryColumnDefinition[] = [
  {
    key: "source_note",
    label: "Note",
    render: (row) => <SourceNoteIcon lines={productDictionarySourceNote(row)} />,
  },
  { key: "asset_class", label: "Asset", minClass: "min-w-[90px]", render: (row) => fmtText(row.asset_class) },
  { key: "region", label: "Region", minClass: "min-w-[100px]", render: (row) => fmtText(row.region) },
  {
    key: "cc",
    label: "Product",
    minClass: "min-w-[220px]",
    render: (row) => productDictionaryDisplayName(row),
  },
  { key: "blotter_cc", label: "Blotter CC", render: (row) => fmtText(row.blotter_cc) },
  {
    key: "ice_trading_screen_hub_name",
    label: "Hub",
    minClass: "min-w-[170px]",
    render: (row) => fmtText(row.ice_trading_screen_hub_name ?? row.hub),
  },
  { key: "hub", label: "Hub Alias", minClass: "min-w-[130px]", render: (row) => fmtText(row.hub) },
  {
    key: "contract_label",
    label: "Contract",
    minClass: "min-w-[150px]",
    render: (row) => fmtText(row.contract_label),
  },
  {
    key: "ice_symbol_pattern",
    label: "ICE Symbol",
    minClass: "min-w-[170px]",
    render: (row) => fmtText(row.ice_symbol_pattern),
  },
  { key: "ice_product_url", label: "ICE Link", render: (row) => <IceProductLink row={row} /> },
  {
    key: "ice_product_title",
    label: "ICE Product",
    minClass: "min-w-[260px]",
    render: (row) => fmtText(row.ice_product_title),
  },
  {
    key: "settlement_source",
    label: "Settlement Source",
    minClass: "min-w-[160px]",
    render: (row) => fmtText(row.settlement_source),
  },
  { key: "contract_family", label: "Contract Type", render: (row) => fmtText(row.contract_family) },
  { key: "market", label: "Market", render: (row) => fmtText(row.market) },
  { key: "shape", label: "Shape", minClass: "min-w-[100px]", render: (row) => fmtText(row.shape) },
  {
    key: "ice_contract_size",
    label: "ICE Contract Size",
    minClass: "min-w-[150px]",
    render: (row) => fmtText(row.ice_contract_size),
  },
  {
    key: "ice_product_type",
    label: "ICE Product Type",
    minClass: "min-w-[190px]",
    render: (row) => fmtText(row.ice_product_type),
  },
  {
    key: "product_name",
    label: "Product Name",
    minClass: "min-w-[230px]",
    render: (row) => fmtText(row.product_name),
  },
  {
    key: "pjm_pnode_name",
    label: "PJM PNode",
    minClass: "min-w-[130px]",
    render: (row) => fmtText(row.pjm_pnode_name),
  },
  { key: "contract_code", label: "Code", render: (row) => fmtText(row.contract_code) },
  {
    key: "settlement_priority",
    label: "Priority",
    align: "right",
    render: (row) => fmtNumber(row.settlement_priority, 0),
  },
  { key: "active", label: "Active", render: (row) => (row.active ? "Yes" : "No") },
  { key: "ice_product_id", label: "ICE ID", render: (row) => fmtText(row.ice_product_id) },
  {
    key: "ice_contract_symbol",
    label: "ICE Contract Symbol",
    minClass: "min-w-[150px]",
    render: (row) => fmtText(row.ice_contract_symbol),
  },
  {
    key: "ice_trading_screen_product_name",
    label: "ICE Screen Product",
    minClass: "min-w-[170px]",
    render: (row) => fmtText(row.ice_trading_screen_product_name),
  },
  {
    key: "ice_reference_price",
    label: "ICE Reference Price",
    minClass: "min-w-[240px]",
    render: (row) => fmtText(row.ice_reference_price),
  },
  {
    key: "ice_specified_price",
    label: "ICE Specified Price",
    minClass: "min-w-[220px]",
    render: (row) => fmtText(row.ice_specified_price),
  },
  {
    key: "ice_metadata_status",
    label: "ICE Metadata",
    minClass: "min-w-[170px]",
    render: (row) => fmtText(row.ice_metadata_status),
  },
  {
    key: "blotter_hub_aliases",
    label: "Hub Aliases",
    minClass: "min-w-[260px]",
    render: (row) => fmtText(row.blotter_hub_aliases),
  },
  { key: "notes", label: "Notes", minClass: "min-w-[360px]", render: (row) => fmtText(row.notes) },
];

const DEFAULT_PRODUCT_DICTIONARY_COLUMN_KEYS: ProductDictionaryColumnKey[] = [
  "source_note",
  "cc",
  "asset_class",
  "region",
  "ice_trading_screen_hub_name",
  "contract_label",
  "ice_symbol_pattern",
  "ice_product_url",
  "contract_family",
  "market",
  "shape",
  "ice_contract_size",
  "settlement_source",
];

function productDictionaryRowKey(row: ProductDictionaryRow): string {
  return `${row.cc}-${row.contract_code}-${row.ice_symbol_pattern}-${row.settlement_source}`;
}

function productDictionaryCellSelectionKey(rowKey: string, columnKey: ProductDictionaryColumnKey): string {
  return `${rowKey}::${columnKey}`;
}

function productDictionaryCellSelectionKeyFromCoordinate(coordinate: ProductDictionaryCellCoordinate): string {
  return productDictionaryCellSelectionKey(coordinate.rowKey, coordinate.columnKey);
}

function productDictionaryCellSelectionKeysInRange(
  anchor: ProductDictionaryCellCoordinate,
  focus: ProductDictionaryCellCoordinate,
  rows: ProductDictionaryRow[],
  columns: ProductDictionaryColumnDefinition[]
): Set<string> {
  const minRow = Math.min(anchor.rowIndex, focus.rowIndex);
  const maxRow = Math.max(anchor.rowIndex, focus.rowIndex);
  const minColumn = Math.min(anchor.columnIndex, focus.columnIndex);
  const maxColumn = Math.max(anchor.columnIndex, focus.columnIndex);
  const selected = new Set<string>();

  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row) continue;
    const rowKey = productDictionaryRowKey(row);
    for (let columnIndex = minColumn; columnIndex <= maxColumn; columnIndex += 1) {
      const column = columns[columnIndex];
      if (!column) continue;
      selected.add(productDictionaryCellSelectionKey(rowKey, column.key));
    }
  }

  return selected;
}

function productDictionaryColumnValue(
  row: ProductDictionaryRow,
  key: ProductDictionaryColumnKey
): string | number | boolean | null {
  if (key === "source_note") {
    return productDictionarySourceNote(row)
      .map((line) => `${line.label}: ${line.value}`)
      .join(" | ");
  }
  if (key === "cc") return productDictionaryDisplayName(row);
  if (key === "settlement_priority") return toFiniteNumber(row.settlement_priority);
  return row[key] ?? null;
}

function productDictionaryColumnDisplayValue(row: ProductDictionaryRow, key: ProductDictionaryColumnKey): string {
  const value = productDictionaryColumnValue(row, key);
  if (value === null) return "";
  if (key === "settlement_priority") return fmtNumber(Number(value), 0);
  if (key === "active") return value ? "Yes" : "No";
  return String(value);
}

function productDictionaryColumnSortValue(
  row: ProductDictionaryRow,
  key: ProductDictionaryColumnKey
): string | number | boolean | null {
  if (key === "cc") return productDictionaryDisplaySortKey(row);
  if (key === "contract_code" || key === "contract_label" || key === "contract_family") {
    return productContractSortValue(row);
  }
  if (key === "settlement_source") return PRODUCT_SETTLEMENT_SOURCE_SORT_ORDER[row.settlement_source] ?? 99;
  return productDictionaryColumnValue(row, key);
}

function productDictionaryRowMatchesColumnFilter(
  row: ProductDictionaryRow,
  key: ProductDictionaryColumnKey,
  selectedValues: string[]
): boolean {
  if (selectedValues.length === 0) return true;
  const filterText = productDictionaryColumnDisplayValue(row, key).toLowerCase();
  return selectedValues.some((value) => filterText === value.trim().toLowerCase());
}

function compareProductDictionaryColumnValues(
  firstRow: ProductDictionaryRow,
  secondRow: ProductDictionaryRow,
  sort: ProductDictionarySortState
): number {
  const firstValue = productDictionaryColumnSortValue(firstRow, sort.key);
  const secondValue = productDictionaryColumnSortValue(secondRow, sort.key);

  if (firstValue === null && secondValue === null) return 0;
  if (firstValue === null) return 1;
  if (secondValue === null) return -1;

  const direction = sort.direction === "asc" ? 1 : -1;
  if (typeof firstValue === "number" && typeof secondValue === "number") {
    const primary = (firstValue - secondValue) * direction;
    if (primary !== 0) return primary;
  }

  const primary = String(firstValue).localeCompare(String(secondValue), undefined, {
    numeric: true,
    sensitivity: "base",
  }) * direction;
  if (primary !== 0) return primary;

  return (
    productDictionaryDisplayName(firstRow).localeCompare(productDictionaryDisplayName(secondRow), undefined, {
      numeric: true,
      sensitivity: "base",
    }) ||
    productContractSortValue(firstRow) - productContractSortValue(secondRow) ||
    String(firstRow.cc ?? "").localeCompare(String(secondRow.cc ?? ""), undefined, {
      numeric: true,
      sensitivity: "base",
    }) ||
    String(firstRow.market ?? "").localeCompare(String(secondRow.market ?? ""), undefined, {
      numeric: true,
      sensitivity: "base",
    }) ||
    String(firstRow.shape ?? "").localeCompare(String(secondRow.shape ?? ""), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
}

function labelsForProductDictionaryColumnKeys(keys: ProductDictionaryColumnKey[]): string[] {
  return keys
    .map((key) => PRODUCT_DICTIONARY_COLUMN_DEFINITIONS.find((column) => column.key === key)?.label)
    .filter((label): label is string => Boolean(label));
}

export default function IceTradeBlotterProductsView({
  payload,
}: {
  payload: ProductDictionaryPayload;
}) {
  const defaultProductDictionaryColumnLabels = useMemo(
    () => labelsForProductDictionaryColumnKeys(DEFAULT_PRODUCT_DICTIONARY_COLUMN_KEYS),
    []
  );
  const [visibleProductDictionaryColumnLabels, setVisibleProductDictionaryColumnLabels] =
    useState<string[]>(defaultProductDictionaryColumnLabels);
  const [productDictionaryColumnFilters, setProductDictionaryColumnFilters] =
    useState<ProductDictionaryColumnFilters>({});
  const [productDictionarySortState, setProductDictionarySortState] =
    useState<ProductDictionarySortState | null>(DEFAULT_PRODUCT_DICTIONARY_SORT_STATE);
  const [selectedProductDictionaryCellKeys, setSelectedProductDictionaryCellKeys] =
    useState<Set<string>>(() => new Set());
  const [productDictionarySelectionAnchor, setProductDictionarySelectionAnchor] =
    useState<ProductDictionaryCellCoordinate | null>(null);
  const [isSelectingProductDictionaryCells, setIsSelectingProductDictionaryCells] =
    useState(false);
  const [selectedProductRuleKey, setSelectedProductRuleKey] = useState<string | null>(null);

  const productDictionaryRows = payload.rows;
  const productDictionarySubtitle = `${payload.summary.activeRowCount.toLocaleString()} active | ${payload.summary.iceRowCount.toLocaleString()} ICE marks | ${payload.summary.optionRowCount.toLocaleString()} options`;
  const productDictionaryColumnByLabel = useMemo(
    () => new Map(PRODUCT_DICTIONARY_COLUMN_DEFINITIONS.map((column) => [column.label, column] as const)),
    []
  );
  const visibleProductDictionaryColumns = useMemo(
    () =>
      visibleProductDictionaryColumnLabels
        .map((label) => productDictionaryColumnByLabel.get(label))
        .filter((column): column is ProductDictionaryColumnDefinition => Boolean(column)),
    [productDictionaryColumnByLabel, visibleProductDictionaryColumnLabels]
  );

  const clearProductDictionaryCellSelection = () => {
    setSelectedProductDictionaryCellKeys(new Set());
    setProductDictionarySelectionAnchor(null);
    setIsSelectingProductDictionaryCells(false);
  };

  const updateProductDictionaryColumnFilter = (
    key: ProductDictionaryColumnKey,
    values: string[]
  ) => {
    setProductDictionaryColumnFilters((filters) => {
      const next = { ...filters };
      if (values.length > 0) {
        next[key] = values;
      } else {
        delete next[key];
      }
      return next;
    });
    clearProductDictionaryCellSelection();
  };

  const handleVisibleProductDictionaryColumnLabelsChange = (labels: string[]) => {
    const visibleKeys = new Set(
      PRODUCT_DICTIONARY_COLUMN_DEFINITIONS.filter((column) =>
        labels.includes(column.label)
      ).map((column) => column.key)
    );
    setVisibleProductDictionaryColumnLabels(labels);
    clearProductDictionaryCellSelection();
    setProductDictionaryColumnFilters((filters) =>
      Object.fromEntries(
        Object.entries(filters).filter(([key]) => visibleKeys.has(key as ProductDictionaryColumnKey))
      ) as ProductDictionaryColumnFilters
    );
    setProductDictionarySortState((sort) => (sort && visibleKeys.has(sort.key) ? sort : null));
  };

  const updateProductDictionarySort = (key: ProductDictionaryColumnKey) => {
    setProductDictionarySortState((sort) =>
      sort?.key === key && sort.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" }
    );
  };

  const productDictionaryColumnFilterOptions = useMemo(() => {
    return Object.fromEntries(
      visibleProductDictionaryColumns.map((column) => {
        const otherFilteredRows = productDictionaryRows.filter((row) =>
          Object.entries(productDictionaryColumnFilters).every(([key, value]) =>
            key === column.key ||
            productDictionaryRowMatchesColumnFilter(row, key as ProductDictionaryColumnKey, value)
          )
        );
        const options = Array.from(
          new Set(
            otherFilteredRows
              .map((row) => productDictionaryColumnDisplayValue(row, column.key))
              .filter((value) => value.trim() !== "" && value !== "--")
          )
        ).sort((first, second) => sortFilterOption(first, second));

        return [column.key, options] as const;
      })
    ) as Partial<Record<ProductDictionaryColumnKey, string[]>>;
  }, [productDictionaryColumnFilters, productDictionaryRows, visibleProductDictionaryColumns]);

  const displayedProductDictionaryRows = useMemo(() => {
    const activeColumnFilters = Object.entries(productDictionaryColumnFilters)
      .map(([key, values]) => [key as ProductDictionaryColumnKey, values] as const)
      .filter(([, values]) => values.length > 0);

    const filteredRows =
      activeColumnFilters.length === 0
        ? productDictionaryRows
        : productDictionaryRows.filter((row) =>
            activeColumnFilters.every(([key, value]) =>
              productDictionaryRowMatchesColumnFilter(row, key, value)
            )
          );

    if (!productDictionarySortState) return filteredRows;
    return [...filteredRows].sort((firstRow, secondRow) =>
      compareProductDictionaryColumnValues(firstRow, secondRow, productDictionarySortState)
    );
  }, [productDictionaryColumnFilters, productDictionaryRows, productDictionarySortState]);
  const selectedProductRuleRow = selectedProductRuleKey
    ? displayedProductDictionaryRows.find((row) => productDictionaryRowKey(row) === selectedProductRuleKey) ?? null
    : null;

  const makeProductDictionaryCellCoordinate = (
    rowIndex: number,
    columnIndex: number,
    row: ProductDictionaryRow,
    column: ProductDictionaryColumnDefinition
  ): ProductDictionaryCellCoordinate => ({
    rowIndex,
    columnIndex,
    rowKey: productDictionaryRowKey(row),
    columnKey: column.key,
  });

  const selectProductDictionaryCellRange = (
    anchor: ProductDictionaryCellCoordinate,
    focus: ProductDictionaryCellCoordinate
  ) => {
    setSelectedProductDictionaryCellKeys(
      productDictionaryCellSelectionKeysInRange(
        anchor,
        focus,
        displayedProductDictionaryRows,
        visibleProductDictionaryColumns
      )
    );
  };

  const handleProductDictionaryCellMouseDown = (
    event: React.MouseEvent<HTMLTableCellElement>,
    coordinate: ProductDictionaryCellCoordinate
  ) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, button, a, select, textarea")) return;
    if (!event.shiftKey && !event.ctrlKey && !event.metaKey) return;

    event.preventDefault();
    if (event.shiftKey && productDictionarySelectionAnchor) {
      selectProductDictionaryCellRange(productDictionarySelectionAnchor, coordinate);
      setIsSelectingProductDictionaryCells(true);
      return;
    }

    const key = productDictionaryCellSelectionKeyFromCoordinate(coordinate);
    if (event.ctrlKey || event.metaKey) {
      setSelectedProductDictionaryCellKeys((selectedKeys) => {
        const next = new Set(selectedKeys);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
      setProductDictionarySelectionAnchor(coordinate);
      setIsSelectingProductDictionaryCells(false);
      return;
    }

    setSelectedProductDictionaryCellKeys(new Set([key]));
    setProductDictionarySelectionAnchor(coordinate);
    setIsSelectingProductDictionaryCells(true);
  };

  const handleProductDictionaryCellMouseEnter = (
    event: React.MouseEvent<HTMLTableCellElement>,
    coordinate: ProductDictionaryCellCoordinate
  ) => {
    if (
      !isSelectingProductDictionaryCells ||
      !productDictionarySelectionAnchor ||
      event.buttons !== 1
    ) {
      return;
    }
    selectProductDictionaryCellRange(productDictionarySelectionAnchor, coordinate);
  };

  useEffect(() => {
    if (!isSelectingProductDictionaryCells) return;
    const stopSelecting = () => setIsSelectingProductDictionaryCells(false);
    window.addEventListener("mouseup", stopSelecting);
    return () => window.removeEventListener("mouseup", stopSelecting);
  }, [isSelectingProductDictionaryCells]);

  useEffect(() => {
    const visibleKeys = new Set(displayedProductDictionaryRows.map((row) => productDictionaryRowKey(row)));
    setSelectedProductRuleKey((key) => (key && visibleKeys.has(key) ? key : null));
  }, [displayedProductDictionaryRows]);

  useEffect(() => {
    if (!selectedProductRuleKey) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedProductRuleKey(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedProductRuleKey]);

  const renderProductRulePopup = () => {
    if (!selectedProductRuleRow) return null;

    const detailRows: { label: string; value: React.ReactNode }[] = [
      { label: "Blotter CC", value: fmtText(selectedProductRuleRow.blotter_cc) },
      { label: "Product Group", value: fmtText(selectedProductRuleRow.product_group) },
      { label: "Product Name", value: fmtText(selectedProductRuleRow.product_name) },
      { label: "Market", value: fmtText(selectedProductRuleRow.market) },
      { label: "Hub", value: fmtText(selectedProductRuleRow.ice_trading_screen_hub_name ?? selectedProductRuleRow.hub) },
      { label: "Hub Alias", value: fmtText(selectedProductRuleRow.hub) },
      { label: "Blotter Hub Aliases", value: fmtText(selectedProductRuleRow.blotter_hub_aliases) },
      { label: "PJM PNode", value: fmtText(selectedProductRuleRow.pjm_pnode_name) },
      { label: "Contract Code", value: fmtText(selectedProductRuleRow.contract_code) },
      { label: "Contract Label", value: fmtText(selectedProductRuleRow.contract_label) },
      { label: "Contract Type", value: fmtText(selectedProductRuleRow.contract_family) },
      { label: "Hours", value: hourBucketNote(selectedProductRuleRow.hour_bucket) },
      { label: "Shape", value: fmtText(selectedProductRuleRow.shape) },
      { label: "Settlement Source", value: settleSourceNote(selectedProductRuleRow.settlement_source) },
      { label: "Settlement Source Key", value: fmtText(selectedProductRuleRow.settlement_source_key) },
      { label: "Settlement Priority", value: fmtNumber(selectedProductRuleRow.settlement_priority, 0) },
      { label: "ICE Symbol Pattern", value: fmtText(selectedProductRuleRow.ice_symbol_pattern) },
      { label: "ICE Contract Symbol", value: fmtText(selectedProductRuleRow.ice_contract_symbol) },
      { label: "ICE Contract Size", value: fmtText(selectedProductRuleRow.ice_contract_size) },
      { label: "ICE Product Type", value: fmtText(selectedProductRuleRow.ice_product_type) },
      { label: "ICE Product Title", value: fmtText(selectedProductRuleRow.ice_product_title) },
      {
        label: "ICE Product URL",
        value: selectedProductRuleRow.ice_product_url ? (
          <a
            href={selectedProductRuleRow.ice_product_url}
            target="_blank"
            rel="noreferrer"
            className="text-sky-300 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-200"
          >
            {selectedProductRuleRow.ice_product_url}
          </a>
        ) : (
          "--"
        ),
      },
      { label: "ICE Product ID", value: fmtText(selectedProductRuleRow.ice_product_id) },
      { label: "Reference Price", value: fmtText(selectedProductRuleRow.ice_reference_price) },
      { label: "Specified Price", value: fmtText(selectedProductRuleRow.ice_specified_price) },
      { label: "Metadata", value: fmtText(selectedProductRuleRow.ice_metadata_status) },
      { label: "Notes", value: fmtText(selectedProductRuleRow.notes) },
    ];

    return createPortal(
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedProductRuleKey(null);
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ice-product-rule-dialog-title"
          className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#10141d] shadow-2xl shadow-black/50 sm:w-[calc(100vw-2rem)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-800 px-4 py-3">
            <div className="min-w-0">
              <h2 id="ice-product-rule-dialog-title" className="text-sm font-semibold text-gray-100">
                {productDictionaryDisplayName(selectedProductRuleRow)} | {fmtText(selectedProductRuleRow.contract_label)}
              </h2>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-500">
                <span>{fmtText(selectedProductRuleRow.asset_class)}</span>
                <span>{fmtText(selectedProductRuleRow.region)}</span>
                <span>{fmtText(selectedProductRuleRow.market)}</span>
                <span>{fmtText(selectedProductRuleRow.shape)}</span>
                <span>{selectedProductRuleRow.active ? "Active" : "Inactive"}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {productDictionarySourceNote(selectedProductRuleRow).slice(0, 5).map((line) => (
                  <div
                    key={`${line.label}-${line.value}`}
                    className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] text-gray-400"
                  >
                    {line.label}{" "}
                    <span className="font-semibold text-gray-200">{line.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedProductRuleKey(null)}
              className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {detailRows.map((item) => (
                <div key={item.label} className="rounded-md border border-gray-800 bg-gray-950/30 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    {item.label}
                  </div>
                  <div className="mt-1 break-words text-xs text-gray-200">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <>
      <DataTableShell
        title="Rules & Product Dictionary"
        subtitle={productDictionarySubtitle}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs text-gray-400">
              {displayedProductDictionaryRows.length.toLocaleString()} /{" "}
              {productDictionaryRows.length.toLocaleString()} products
            </div>
            <ColumnVisibilityPopover
              columns={PRODUCT_DICTIONARY_COLUMN_DEFINITIONS}
              visibleLabels={visibleProductDictionaryColumnLabels}
              defaultLabels={defaultProductDictionaryColumnLabels}
              onChange={handleVisibleProductDictionaryColumnLabelsChange}
            />
            <button
              type="button"
              onClick={() => {
                setProductDictionaryColumnFilters({});
                setProductDictionarySortState(DEFAULT_PRODUCT_DICTIONARY_SORT_STATE);
                clearProductDictionaryCellSelection();
              }}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Reset Table
            </button>
          </div>
        }
      >
        <div className="min-h-[360px] bg-[#0d1119]">
          <table className="w-full min-w-[1100px] border-collapse bg-[#0d1119] text-xs text-gray-200">
            <thead className="bg-gray-950 text-gray-500">
              <tr className="border-b border-gray-800/80">
                {visibleProductDictionaryColumns.map((column) => {
                  const filterOptions = productDictionaryColumnFilterOptions[column.key] ?? EMPTY_FILTER_VALUES;
                  const selectedFilters = productDictionaryColumnFilters[column.key] ?? EMPTY_FILTER_VALUES;
                  const sortDirection =
                    productDictionarySortState?.key === column.key
                      ? productDictionarySortState.direction
                      : null;

                  return (
                    <th
                      key={column.key}
                      className={`px-3 py-2 text-left font-semibold uppercase tracking-wide ${
                        column.align === "right" ? "text-right" : ""
                      } ${column.minClass ?? ""}`}
                    >
                      <div className="flex min-w-[110px] items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => updateProductDictionarySort(column.key)}
                          className={`flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-gray-900 ${
                            productDictionarySortState?.key === column.key
                              ? "text-sky-200"
                              : "text-gray-400"
                          }`}
                          aria-label={`Sort ${column.label}`}
                        >
                          <span className="truncate whitespace-nowrap text-[10px]">
                            {column.label}
                          </span>
                          <span className="w-3 shrink-0 text-right text-[10px] text-sky-300">
                            {productDictionarySortState?.key === column.key
                              ? productDictionarySortState.direction === "asc"
                                ? "\u2191"
                                : "\u2193"
                              : ""}
                          </span>
                        </button>
                        <ColumnFilterMenu
                          label={column.label}
                          options={filterOptions}
                          selected={selectedFilters}
                          sortDirection={sortDirection}
                          onSort={(direction) => setProductDictionarySortState({ key: column.key, direction })}
                          onChange={(values) => updateProductDictionaryColumnFilter(column.key, values)}
                        />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {displayedProductDictionaryRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={Math.max(visibleProductDictionaryColumns.length, 1)}
                    className="px-3 py-8 text-center text-sm text-gray-500"
                  >
                    No products found.
                  </td>
                </tr>
              ) : (
                displayedProductDictionaryRows.map((row, rowIndex) => {
                  const rowKey = productDictionaryRowKey(row);
                  const selectedRule = selectedProductRuleKey === rowKey;
                  return (
                  <tr
                    key={rowKey}
                    onClick={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest("input, button, a, select, textarea")) return;
                      setSelectedProductRuleKey(rowKey);
                      clearProductDictionaryCellSelection();
                    }}
                    className={`cursor-pointer hover:bg-gray-900/60 ${
                      selectedRule ? "bg-sky-500/10" : ""
                    }`}
                  >
                    {visibleProductDictionaryColumns.map((column, columnIndex) => {
                      const coordinate = makeProductDictionaryCellCoordinate(
                        rowIndex,
                        columnIndex,
                        row,
                        column
                      );
                      const selected = selectedProductDictionaryCellKeys.has(
                        productDictionaryCellSelectionKeyFromCoordinate(coordinate)
                      );

                      return (
                        <td
                          key={column.key}
                          aria-selected={selected}
                          onMouseDown={(event) => handleProductDictionaryCellMouseDown(event, coordinate)}
                          onMouseEnter={(event) => handleProductDictionaryCellMouseEnter(event, coordinate)}
                          className={`px-3 py-2 text-gray-300 ${
                            column.align === "right" ? "text-right tabular-nums" : ""
                          } ${column.minClass ?? ""} ${
                            selected ? "outline outline-1 -outline-offset-1 outline-sky-400/80" : ""
                          }`}
                        >
                          {column.render(row)}
                        </td>
                      );
                    })}
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
    </DataTableShell>
    {renderProductRulePopup()}
    </>
  );
}
