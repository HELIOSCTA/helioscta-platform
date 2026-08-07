"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import ControlCard from "@/components/dashboard/ControlCard";
import DataTableShell from "@/components/dashboard/DataTableShell";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import { TRADING_CALENDAR_REGISTRY, type TradingCalendarId } from "@/lib/tradingCalendars";

type CalendarSelection = "all" | TradingCalendarId;
type RowPreset = "nonTrading" | "all";
type SortDirection = "asc" | "desc";
type ColumnKey =
  | "date"
  | "calendar"
  | "category"
  | "status"
  | "event"
  | "weekend"
  | "tradingDay"
  | "previous"
  | "next"
  | "source";
type ColumnFilters = Partial<Record<ColumnKey, string[]>>;
type StatusTone = "ok" | "partial" | "missing" | "neutral";

interface TradingCalendarDayRow {
  calendarId: TradingCalendarId;
  calendarLabel: string;
  category: string;
  date: string;
  dayName: string;
  isWeekend: boolean;
  isHoliday: boolean;
  isTradingDay: boolean;
  eventName: string | null;
  eventCategory: string | null;
  tradingStatus: string;
  previousTradingDate: string;
  nextTradingDate: string;
  source: string | null;
  sourceUrl: string | null;
  notes: string | null;
}

interface TradingCalendarPayload {
  year: number;
  requestedCalendar: CalendarSelection;
  calendars: Array<{
    calendarId: TradingCalendarId;
    label: string;
    category: string;
    source: string | null;
    sourceUrl: string | null;
    sourceCoverage: string | null;
    events: unknown[];
    nonTradingDays: unknown[];
    specialTradingDays: unknown[];
  }>;
  dayRows: TradingCalendarDayRow[];
  summary: {
    calendarCount: number;
    dayCount: number;
    eventCount: number;
    nonTradingDayCount: number;
    specialTradingDayCount: number;
  };
}

interface SortState {
  key: ColumnKey;
  direction: SortDirection;
}

interface ColumnDefinition {
  key: ColumnKey;
  label: string;
  align?: "left" | "right";
  sticky?: boolean;
}

const API_CACHE_TTL_MS = 60 * 60 * 1000;
const MIN_YEAR = 2020;
const MAX_YEAR = 2030;
const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_YEAR = Math.min(Math.max(CURRENT_YEAR, MIN_YEAR), MAX_YEAR);
const DEFAULT_ROW_PRESET: RowPreset = "nonTrading";
const DEFAULT_SORT_STATE: SortState = { key: "date", direction: "asc" };
const EMPTY_FILTER_VALUES: string[] = [];
const YEAR_OPTIONS = Array.from(
  { length: MAX_YEAR - MIN_YEAR + 1 },
  (_, index) => MIN_YEAR + index,
);

const CALENDAR_OPTIONS = TRADING_CALENDAR_REGISTRY.map((entry) => ({
  value: entry.id,
  label: entry.calendar.label,
}));

const ROW_PRESET_OPTIONS: Array<{ value: RowPreset; label: string }> = [
  { value: "nonTrading", label: "Non-Trading" },
  { value: "all", label: "All Days" },
];

const TABLE_COLUMNS: ColumnDefinition[] = [
  { key: "date", label: "Date", sticky: true },
  { key: "calendar", label: "Calendar" },
  { key: "category", label: "Category" },
  { key: "status", label: "Status" },
  { key: "event", label: "Event" },
  { key: "weekend", label: "Weekend" },
  { key: "tradingDay", label: "Trading Day" },
  { key: "previous", label: "Previous" },
  { key: "next", label: "Next" },
  { key: "source", label: "Source" },
];

function pillClass(active: boolean): string {
  return active
    ? "border-sky-500/50 bg-sky-500/10 text-sky-100"
    : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300";
}

function statusToneClass(status: "loading" | "error" | "loaded" | "idle"): string {
  if (status === "loading") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (status === "error") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (status === "loaded") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  return "border-gray-800 bg-gray-950/40 text-gray-500";
}

function statusBadgeClass(row: TradingCalendarDayRow): string {
  if (!row.isTradingDay || row.tradingStatus === "closed" || row.tradingStatus === "non-trading") {
    return "border-red-500/40 bg-red-500/10 text-red-200";
  }
  if (row.tradingStatus === "modified" || row.tradingStatus === "special") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  }
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
}

function flagBadgeClass(tone: StatusTone): string {
  if (tone === "ok") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (tone === "partial") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (tone === "missing") return "border-red-500/40 bg-red-500/10 text-red-200";
  return "border-gray-700 bg-gray-900 text-gray-400";
}

function sortFilterOption(first: string, second: string): number {
  return first.localeCompare(second, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function sortedFilterValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort(
    sortFilterOption,
  );
}

function uniqueDisplayValues(values: Array<string | null | undefined>): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }

  return unique;
}

function joinUniqueValues(values: Array<string | null | undefined>, fallback: string): string {
  const unique = uniqueDisplayValues(values);
  return unique.length > 0 ? unique.join(" | ") : fallback;
}

function calendarSelectionLabel(selection: CalendarSelection): string {
  if (selection === "all") return "All Calendars";
  return CALENDAR_OPTIONS.find((option) => option.value === selection)?.label ?? selection;
}

function columnDisplayValue(row: TradingCalendarDayRow, key: ColumnKey): string {
  if (key === "date") return row.date;
  if (key === "calendar") return row.calendarLabel;
  if (key === "category") return row.category;
  if (key === "status") return row.tradingStatus;
  if (key === "event") return row.eventName ?? "No Event";
  if (key === "weekend") return row.isWeekend ? "Weekend" : "Weekday";
  if (key === "tradingDay") return row.isTradingDay ? "Trading Day" : "Non-Trading";
  if (key === "previous") return row.previousTradingDate;
  if (key === "next") return row.nextTradingDate;
  return row.source ?? "No Source";
}

function columnSortValue(row: TradingCalendarDayRow, key: ColumnKey): string | number | null {
  if (key === "event") return row.eventName;
  if (key === "source") return row.source;
  if (key === "weekend") return row.isWeekend ? 1 : 0;
  if (key === "tradingDay") return row.isTradingDay ? 0 : 1;
  return columnDisplayValue(row, key);
}

function rowMatchesColumnFilter(
  row: TradingCalendarDayRow,
  key: ColumnKey,
  selectedValues: string[],
): boolean {
  if (selectedValues.length === 0) return true;

  const filterText = columnDisplayValue(row, key).trim().toLowerCase();
  return selectedValues.some((value) => filterText === value.trim().toLowerCase());
}

function isExplicitNonTradingRow(row: TradingCalendarDayRow): boolean {
  if (row.isTradingDay) return false;
  return row.isHoliday || Boolean(row.eventName) || Boolean(row.eventCategory) || !row.isWeekend;
}

function buildCondensedNonTradingRows(rows: TradingCalendarDayRow[]): TradingCalendarDayRow[] {
  const rowsByDate = new Map<string, TradingCalendarDayRow[]>();

  for (const row of rows) {
    if (!isExplicitNonTradingRow(row)) continue;
    const existing = rowsByDate.get(row.date);
    if (existing) {
      existing.push(row);
    } else {
      rowsByDate.set(row.date, [row]);
    }
  }

  return Array.from(rowsByDate.values()).map((dateRows) => {
    const firstRow = dateRows[0];
    const sourceUrls = uniqueDisplayValues(dateRows.map((row) => row.sourceUrl));

    return {
      ...firstRow,
      calendarLabel: joinUniqueValues(dateRows.map((row) => row.calendarLabel), "Multiple Calendars"),
      category: joinUniqueValues(dateRows.map((row) => row.category), "Multiple"),
      isHoliday: dateRows.some((row) => row.isHoliday),
      isTradingDay: false,
      eventName: joinUniqueValues(dateRows.map((row) => row.eventName), "Non-trading day"),
      eventCategory: joinUniqueValues(dateRows.map((row) => row.eventCategory), "Non-trading"),
      tradingStatus: "non-trading",
      previousTradingDate: joinUniqueValues(
        dateRows.map((row) => row.previousTradingDate),
        "--",
      ),
      nextTradingDate: joinUniqueValues(dateRows.map((row) => row.nextTradingDate), "--"),
      source: joinUniqueValues(dateRows.map((row) => row.source), "Multiple sources"),
      sourceUrl: sourceUrls.length === 1 ? sourceUrls[0] : null,
      notes: joinUniqueValues(dateRows.map((row) => row.notes), ""),
    };
  });
}

function compareColumnValues(
  firstRow: TradingCalendarDayRow,
  secondRow: TradingCalendarDayRow,
  sort: SortState,
): number {
  const firstValue = columnSortValue(firstRow, sort.key);
  const secondValue = columnSortValue(secondRow, sort.key);

  if (firstValue === null && secondValue === null) return 0;
  if (firstValue === null) return 1;
  if (secondValue === null) return -1;

  const direction = sort.direction === "asc" ? 1 : -1;
  if (typeof firstValue === "number" && typeof secondValue === "number") {
    return (firstValue - secondValue) * direction;
  }

  return (
    String(firstValue).localeCompare(String(secondValue), undefined, {
      numeric: true,
      sensitivity: "base",
    }) * direction
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
      const left = Math.min(
        Math.max(rect.left, margin),
        window.innerWidth - menuWidth - margin,
      );
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

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions =
    normalizedQuery.length === 0
      ? options
      : options.filter((option) => option.toLowerCase().includes(normalizedQuery));

  const toggleValue = (option: string) => {
    setDraftSelected((values) =>
      values.includes(option)
        ? values.filter((value) => value !== option)
        : [...values, option],
    );
  };

  const applyDraft = () => {
    onChange(draftSelected);
    setOpen(false);
  };

  const clearFilter = () => {
    onChange([]);
    setDraftSelected([]);
    setOpen(false);
  };

  const cancelDraft = () => {
    setDraftSelected(selected);
    setOpen(false);
  };

  const handleSort = (direction: SortDirection) => {
    onSort(direction);
    setOpen(false);
  };

  const menu =
    open && menuPosition && typeof document !== "undefined" ? (
      <div
        ref={menuRef}
        className="fixed z-[100] w-64 rounded-md border border-gray-700 bg-[#12141d] shadow-2xl shadow-black/40"
        style={{ left: menuPosition.left, top: menuPosition.top }}
      >
        <div className="border-b border-gray-800 py-1">
          <button
            type="button"
            onClick={() => handleSort("asc")}
            className={`w-full px-3 py-1.5 text-left text-xs font-medium transition-colors hover:bg-gray-800 ${
              sortDirection === "asc" ? "text-sky-200" : "text-gray-300"
            }`}
          >
            {"\u2191"} Sort Ascending
          </button>
          <button
            type="button"
            onClick={() => handleSort("desc")}
            className={`w-full px-3 py-1.5 text-left text-xs font-medium transition-colors hover:bg-gray-800 ${
              sortDirection === "desc" ? "text-sky-200" : "text-gray-300"
            }`}
          >
            {"\u2193"} Sort Descending
          </button>
        </div>
        <div className="border-b border-gray-800 p-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="h-7 w-full rounded border border-gray-700 bg-gray-950 px-2 text-xs font-medium normal-case tracking-normal text-gray-200 outline-none placeholder:text-gray-600 focus:border-gray-500"
          />
          <div className="mt-1 text-[10px] font-semibold normal-case tracking-normal text-gray-500">
            {draftSelected.length.toLocaleString()} selected
          </div>
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-3 text-xs font-medium normal-case tracking-normal text-gray-600">
              No values
            </div>
          ) : (
            filteredOptions.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs font-medium normal-case tracking-normal text-gray-300 hover:bg-gray-800"
              >
                <input
                  type="checkbox"
                  checked={draftSelected.includes(option)}
                  onChange={() => toggleValue(option)}
                  className="h-3.5 w-3.5 rounded border-gray-700 bg-gray-950 accent-sky-500"
                />
                <span className="truncate" title={option}>
                  {option}
                </span>
              </label>
            ))
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-800 p-2">
          <button
            type="button"
            onClick={applyDraft}
            className="rounded-md border border-sky-500/60 bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-100 transition-colors hover:bg-sky-500/30"
          >
            OK
          </button>
          <button
            type="button"
            onClick={clearFilter}
            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-800"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={cancelDraft}
            className="rounded-md border border-gray-800 bg-gray-950 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-gray-700 hover:text-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex h-5 w-5 items-center justify-center rounded border text-[10px] outline-none transition-colors ${
          selected.length > 0
            ? "border-sky-500/50 bg-sky-500/15 text-sky-100"
            : "border-gray-800 bg-gray-950 text-gray-500 hover:border-gray-700 hover:text-gray-200"
        }`}
        aria-expanded={open}
        aria-label={`Filter ${label}`}
        title={`Filter ${label}`}
      >
        {"\u25BE"}
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

function HeaderCell({
  column,
  sort,
  filterOptions,
  selectedFilters,
  onToggleSort,
  onSort,
  onFilterChange,
}: {
  column: ColumnDefinition;
  sort: SortState;
  filterOptions: string[];
  selectedFilters: string[];
  onToggleSort: (key: ColumnKey) => void;
  onSort: (key: ColumnKey, direction: SortDirection) => void;
  onFilterChange: (key: ColumnKey, values: string[]) => void;
}) {
  const sortDirection = sort.key === column.key ? sort.direction : null;
  return (
    <th
      className={`${column.sticky ? "sticky left-0 z-20 bg-gray-950" : ""} whitespace-nowrap px-2 py-2 ${
        column.align === "right" ? "text-right" : "text-left"
      } font-semibold uppercase tracking-wide text-gray-500`}
    >
      <div className={`flex w-max items-center gap-1.5 ${column.align === "right" ? "ml-auto" : ""}`}>
        <button
          type="button"
          onClick={() => onToggleSort(column.key)}
          className={`flex w-max items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-gray-900 ${
            sortDirection ? "text-sky-200" : "text-gray-400"
          }`}
          aria-label={`Sort ${column.label}`}
        >
          <span className="whitespace-nowrap text-[10px] leading-3">{column.label}</span>
          <span className="w-3 shrink-0 text-right text-[10px] text-sky-300">
            {sortDirection ? (sortDirection === "asc" ? "\u2191" : "\u2193") : ""}
          </span>
        </button>
        <ColumnFilterMenu
          label={column.label}
          options={filterOptions}
          selected={selectedFilters}
          sortDirection={sortDirection}
          onSort={(direction) => onSort(column.key, direction)}
          onChange={(values) => onFilterChange(column.key, values)}
        />
      </div>
    </th>
  );
}

export default function TradingCalendarsDashboard() {
  const [selectedCalendar, setSelectedCalendar] = useState<CalendarSelection>("all");
  const [selectedYear, setSelectedYear] = useState(DEFAULT_YEAR);
  const [rowPreset, setRowPreset] = useState<RowPreset>(DEFAULT_ROW_PRESET);
  const [textFilter, setTextFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT_STATE);
  const [data, setData] = useState<TradingCalendarPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const params = new URLSearchParams({
      calendar: selectedCalendar,
      year: String(selectedYear),
      includeObserved: "1",
    });
    const url = `/api/trading-calendars?${params.toString()}`;

    setLoading(true);
    setError(null);
    fetchJsonWithCache<TradingCalendarPayload>({
      key: `trading-calendars:${selectedCalendar}:${selectedYear}`,
      url,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
    })
      .then((payload) => {
        if (!active) return;
        setData(payload);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load trading calendars");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedCalendar, selectedYear]);

  const presetRows = useMemo(() => {
    const rows = data?.dayRows ?? [];
    if (rowPreset === "all") return rows;
    return buildCondensedNonTradingRows(rows);
  }, [data, rowPreset]);

  const columnFilterOptions = useMemo(() => {
    return TABLE_COLUMNS.reduce((options, column) => {
      options[column.key] = sortedFilterValues(
        presetRows.map((row) => columnDisplayValue(row, column.key)),
      );
      return options;
    }, {} as Record<ColumnKey, string[]>);
  }, [presetRows]);

  const filteredRows = useMemo(() => {
    const text = textFilter.trim().toLowerCase();
    return presetRows
      .filter((row) => {
        if (!text) return true;
        return [
          row.calendarLabel,
          row.category,
          row.date,
          row.dayName,
          row.eventName,
          row.eventCategory,
          row.tradingStatus,
          row.isWeekend ? "weekend" : "weekday",
          row.isTradingDay ? "trading day" : "non-trading",
          row.source,
          row.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(text);
      })
      .filter((row) =>
        TABLE_COLUMNS.every((column) =>
          rowMatchesColumnFilter(
            row,
            column.key,
            columnFilters[column.key] ?? EMPTY_FILTER_VALUES,
          ),
        ),
      )
      .sort((left, right) => compareColumnValues(left, right, sort));
  }, [columnFilters, presetRows, sort, textFilter]);

  const activeColumnFilterCount = Object.values(columnFilters).filter(
    (values) => values && values.length > 0,
  ).length;
  const activeFilterCount = activeColumnFilterCount + (textFilter.trim() ? 1 : 0);
  const tableDirty =
    rowPreset !== DEFAULT_ROW_PRESET ||
    activeFilterCount > 0 ||
    sort.key !== DEFAULT_SORT_STATE.key ||
    sort.direction !== DEFAULT_SORT_STATE.direction;
  const selectedCalendarLabel = calendarSelectionLabel(selectedCalendar);
  const totalRows = data?.summary.dayCount ?? 0;
  const presetRowCount = presetRows.length;
  const loadStatus = loading ? "loading" : error ? "error" : data ? "loaded" : "idle";

  const toggleSort = (key: ColumnKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  };

  const updateColumnFilter = (key: ColumnKey, values: string[]) => {
    setColumnFilters((current) => {
      const next = { ...current };
      if (values.length === 0) {
        delete next[key];
      } else {
        next[key] = values;
      }
      return next;
    });
  };

  const resetTable = () => {
    setRowPreset(DEFAULT_ROW_PRESET);
    setTextFilter("");
    setColumnFilters({});
    setSort(DEFAULT_SORT_STATE);
  };

  return (
    <div className="space-y-4">
      <ControlCard title="Calendar Scope">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Inputs
            </span>
            <span className="h-px flex-1 bg-gray-800" />
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusToneClass(loadStatus)}`}
            >
              {loading ? "Loading" : error ? "Error" : data ? "Loaded" : "Idle"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Calendar
            </span>
            <button
              type="button"
              onClick={() => setSelectedCalendar("all")}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${pillClass(selectedCalendar === "all")}`}
            >
              All
            </button>
            {CALENDAR_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedCalendar(option.value)}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${pillClass(selectedCalendar === option.value)}`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Year
            </span>
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              className="h-8 w-24 rounded-md border border-gray-700 bg-gray-950 px-2 text-xs font-semibold tabular-nums text-gray-200 outline-none focus:border-sky-500"
            >
              {YEAR_OPTIONS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={textFilter}
              onChange={(event) => setTextFilter(event.target.value)}
              placeholder="Search rows"
              className="h-8 min-w-[220px] rounded-md border border-gray-700 bg-gray-950 px-2 text-xs text-gray-200 outline-none placeholder:text-gray-600 focus:border-sky-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Rows
            </span>
            {ROW_PRESET_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={rowPreset === option.value}
                onClick={() => setRowPreset(option.value)}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${pillClass(rowPreset === option.value)}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </ControlCard>

      <DataTableShell
        title="Calendar Day Rows"
        subtitle={data?.calendars.map((calendar) => calendar.label).join(" | ") ?? "Code-owned calendar registry"}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-gray-500">
              {selectedYear}
            </span>
            <span className="max-w-[260px] truncate rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] font-semibold text-gray-500">
              {selectedCalendarLabel}
            </span>
            <span className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-gray-500">
              {filteredRows.length.toLocaleString()} / {presetRowCount.toLocaleString()} shown
            </span>
            <span className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-gray-500">
              {totalRows.toLocaleString()} source rows
            </span>
            <span
              className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                activeFilterCount > 0
                  ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
                  : "border-gray-800 bg-gray-950/40 text-gray-500"
              }`}
            >
              {activeFilterCount.toLocaleString()} filters
            </span>
            <button
              type="button"
              onClick={resetTable}
              disabled={!tableDirty}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-gray-950/40 disabled:text-gray-600"
            >
              Reset Table
            </button>
          </div>
        }
        bodyClassName="bg-[#0d1119]"
      >
        <div className="min-h-[360px] min-w-full bg-[#0d1119]">
          {loading && data && (
            <div className="border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">
              Refreshing trading calendars...
            </div>
          )}
          {error && (
            <div className="border-b border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200">
              {error}
            </div>
          )}
          <table className="w-max min-w-[1380px] border-collapse bg-[#0d1119] text-xs text-gray-200">
            <thead className="bg-gray-950 text-gray-500">
              <tr className="border-b border-gray-800/80">
                {TABLE_COLUMNS.map((column) => (
                  <HeaderCell
                    key={column.key}
                    column={column}
                    sort={sort}
                    filterOptions={columnFilterOptions[column.key] ?? EMPTY_FILTER_VALUES}
                    selectedFilters={columnFilters[column.key] ?? EMPTY_FILTER_VALUES}
                    onToggleSort={toggleSort}
                    onSort={(key, direction) => setSort({ key, direction })}
                    onFilterChange={updateColumnFilter}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-[#0d1119]">
              {loading && !data ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-3 py-6 text-center text-sm text-amber-200">
                    Loading trading calendars...
                  </td>
                </tr>
              ) : error && !data ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-3 py-6 text-center text-sm text-red-200">
                    Unable to load trading calendars.
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-3 py-6 text-center text-sm text-gray-500">
                    No calendar rows match the current table filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={`${row.calendarId}:${row.date}`} className="hover:bg-gray-900/50">
                    <td className="sticky left-0 z-10 bg-[#0d1119] px-2 py-2 font-semibold tabular-nums text-gray-200">
                      <div className="flex items-center gap-2">
                        <span>{row.date}</span>
                        <span className="text-[10px] text-gray-600">{row.dayName}</span>
                      </div>
                    </td>
                    <td className="max-w-[220px] px-2 py-2 font-medium text-gray-300">
                      <div className="truncate" title={row.calendarLabel}>
                        {row.calendarLabel}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-gray-500">{row.category}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(row)}`}>
                        {row.tradingStatus}
                      </span>
                    </td>
                    <td className="max-w-[280px] px-2 py-2 text-gray-300">
                      <div className="truncate" title={row.notes ?? row.eventName ?? undefined}>
                        {row.eventName ?? "--"}
                      </div>
                      {row.eventCategory && (
                        <div className="mt-0.5 text-[10px] text-gray-600">{row.eventCategory}</div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${flagBadgeClass(row.isWeekend ? "partial" : "neutral")}`}>
                        {row.isWeekend ? "Weekend" : "Weekday"}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${flagBadgeClass(row.isTradingDay ? "ok" : "missing")}`}>
                        {row.isTradingDay ? "Trading Day" : "Non-Trading"}
                      </span>
                    </td>
                    <td className="px-2 py-2 tabular-nums text-gray-500">{row.previousTradingDate}</td>
                    <td className="px-2 py-2 tabular-nums text-gray-500">{row.nextTradingDate}</td>
                    <td className="max-w-[280px] px-2 py-2 text-gray-500">
                      {row.sourceUrl ? (
                        <a
                          href={row.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sky-300 hover:text-sky-200"
                          title={row.source ?? row.sourceUrl}
                        >
                          {row.source ?? row.sourceUrl}
                        </a>
                      ) : (
                        <span className="block truncate" title={row.source ?? undefined}>
                          {row.source ?? "--"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DataTableShell>
    </div>
  );
}
