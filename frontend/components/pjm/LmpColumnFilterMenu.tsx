"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const EMPTY_COLUMN_FILTER: string[] = [];

export type ColumnFilters<TKey extends string> = Partial<Record<TKey, string[]>>;

export function uniqueColumnOptions(values: string[], direction: "asc" | "desc" = "asc"): string[] {
  return Array.from(new Set(values)).sort((left, right) =>
    direction === "asc" ? left.localeCompare(right) : right.localeCompare(left),
  );
}

export function filterValueLabel(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function matchesColumnFilter(value: string, selected: string[]): boolean {
  return selected.length === 0 || selected.includes(value);
}

export function updateColumnFilter<TKey extends string>(
  filters: ColumnFilters<TKey>,
  key: TKey,
  values: string[],
): ColumnFilters<TKey> {
  const next = { ...filters };
  if (values.length === 0) delete next[key];
  else next[key] = values;
  return next;
}

export default function LmpColumnFilterMenu({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
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
  const allValuesSelected = draftSelected.length === 0;

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

  const selectAllValues = () => {
    setDraftSelected([]);
  };

  const cancelDraft = () => {
    setDraftSelected(selected);
    setOpen(false);
  };

  const menu =
    open && menuPosition && typeof document !== "undefined" ? (
      <div
        ref={menuRef}
        className="fixed z-[100] w-64 rounded-md border border-gray-700 bg-[#12141d] shadow-2xl shadow-black/40"
        style={{ left: menuPosition.left, top: menuPosition.top }}
      >
        <div className="border-b border-gray-800 p-2">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Filter {label}
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="h-7 w-full rounded border border-gray-700 bg-gray-950 px-2 text-xs font-medium normal-case tracking-normal text-gray-200 outline-none placeholder:text-gray-600 focus:border-gray-500"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="min-w-0 text-[10px] font-semibold normal-case tracking-normal text-gray-500">
              {allValuesSelected
                ? `All ${options.length.toLocaleString()} values`
                : `${draftSelected.length.toLocaleString()} selected`}
            </div>
            <button
              type="button"
              onClick={selectAllValues}
              disabled={allValuesSelected}
              className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                allValuesSelected
                  ? "cursor-not-allowed border-gray-800 bg-gray-950/40 text-gray-600"
                  : "border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              Select All
            </button>
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
    <div className="relative inline-flex">
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
