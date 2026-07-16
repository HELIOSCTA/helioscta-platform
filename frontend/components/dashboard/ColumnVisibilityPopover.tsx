"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

interface ColumnVisibilityOption {
  label: string;
  group?: string;
}

interface ColumnVisibilityPopoverProps {
  columns: readonly ColumnVisibilityOption[];
  visibleLabels: string[];
  defaultLabels: string[];
  onChange: (labels: string[]) => void;
  buttonLabel?: string;
}

export default function ColumnVisibilityPopover({
  columns,
  visibleLabels,
  defaultLabels,
  onChange,
  buttonLabel = "Columns",
}: ColumnVisibilityPopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const visibleSet = useMemo(() => new Set(visibleLabels), [visibleLabels]);
  const totalCount = columns.length;
  const selectedColumns = columns.filter((column) => visibleSet.has(column.label));
  const hiddenColumns = columns.filter((column) => !visibleSet.has(column.label));
  const filteredColumns = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return columns;
    return columns.filter((column) => column.label.toLowerCase().includes(needle));
  }, [columns, query]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const showColumn = (label: string) => {
    if (visibleSet.has(label)) return;
    onChange([...visibleLabels, label]);
  };

  const hideColumn = (label: string) => {
    onChange(visibleLabels.filter((candidate) => candidate !== label));
  };

  const toggleColumn = (label: string) => {
    if (visibleSet.has(label)) {
      hideColumn(label);
    } else {
      showColumn(label);
    }
  };

  const popup =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Choose visible columns"
            onMouseDown={() => setOpen(false)}
          >
            <div
              className="flex max-h-[86vh] w-[860px] max-w-full flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-950 text-xs text-gray-200 shadow-2xl shadow-black/60"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-800 px-4 py-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-100">Choose columns</h2>
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    {visibleLabels.length.toLocaleString()} of {totalCount.toLocaleString()} visible
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onChange(defaultLabels)}
                    className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-[11px] font-semibold text-gray-300 hover:bg-gray-800 hover:text-white"
                  >
                    Default
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(columns.map((column) => column.label))}
                    className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] font-semibold text-gray-500 hover:border-gray-700 hover:text-gray-300"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] font-semibold text-gray-500 hover:border-gray-700 hover:text-gray-300"
                  >
                    None
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-[11px] font-semibold text-gray-300 hover:bg-gray-700 hover:text-white"
                  >
                    Done
                  </button>
                </div>
              </div>

              <div className="border-b border-gray-800 px-4 py-3">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search columns..."
                  className="w-full rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-sky-500/60"
                />
              </div>

              <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-[minmax(260px,0.9fr)_minmax(320px,1.1fr)]">
                <section className="min-h-0 border-b border-gray-800 md:border-b-0 md:border-r">
                  <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      Selected
                    </span>
                    <span className="font-mono text-[10px] text-gray-600">
                      {selectedColumns.length}
                    </span>
                  </div>
                  <div className="max-h-[52vh] overflow-auto p-3">
                    {selectedColumns.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-800 px-3 py-8 text-center text-gray-600">
                        No columns selected.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedColumns.map((column) => (
                          <button
                            key={column.label}
                            type="button"
                            onClick={() => hideColumn(column.label)}
                            className="inline-flex max-w-full items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-left text-[11px] text-cyan-100 hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-100"
                            title={`Hide ${column.label}`}
                          >
                            <span className="truncate">{column.label}</span>
                            <span className="text-cyan-300/70">x</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section className="min-h-0">
                  <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      All columns
                    </span>
                    <span className="font-mono text-[10px] text-gray-600">
                      {hiddenColumns.length} hidden
                    </span>
                  </div>
                  <div className="max-h-[52vh] overflow-auto p-3">
                    {filteredColumns.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-800 px-3 py-8 text-center text-gray-600">
                        No matching columns.
                      </div>
                    ) : (
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {filteredColumns.map((column) => {
                          const selected = visibleSet.has(column.label);
                          return (
                            <button
                              key={column.label}
                              type="button"
                              onClick={() => toggleColumn(column.label)}
                              className={`flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
                                selected
                                  ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-100"
                                  : "border-gray-800 bg-gray-950/40 text-gray-400 hover:border-sky-500/50 hover:bg-sky-500/10 hover:text-sky-100"
                              }`}
                            >
                              <span
                                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[9px] ${
                                  selected
                                    ? "border-cyan-400 bg-cyan-400/20 text-cyan-100"
                                    : "border-gray-700 text-transparent"
                                }`}
                              >
                                ✓
                              </span>
                              <span className="min-w-0 truncate">{column.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
      >
        {buttonLabel}{" "}
        <span className="font-mono text-[10px] text-gray-500">
          {visibleLabels.length}/{totalCount}
        </span>
      </button>
      {popup}
    </>
  );
}
