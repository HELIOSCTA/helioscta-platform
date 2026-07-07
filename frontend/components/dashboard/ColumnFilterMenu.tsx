"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SortDirection = "asc" | "desc";

interface ColumnFilterMenuProps {
  label: string;
  options: string[];
  selected: string[];
  sortDirection: SortDirection | null;
  onSort: (direction: SortDirection) => void;
  onChange: (values: string[]) => void;
}

export default function ColumnFilterMenu({
  label,
  options,
  selected,
  sortDirection,
  onSort,
  onChange,
}: ColumnFilterMenuProps) {
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

  const filteredOptions = query.trim()
    ? options.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  const toggleValue = (option: string) => {
    setDraftSelected((values) =>
      values.includes(option) ? values.filter((value) => value !== option) : [...values, option],
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
            onClick={() => setOpen(false)}
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
