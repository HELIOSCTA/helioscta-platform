"use client";

import { useEffect, useState } from "react";

export interface PlotSeries {
  key: string;
  label: string;
  color: string;
  defaultVisible?: boolean;
}

interface PlotCardProps {
  title: string;
  subtitle?: string;
  series: PlotSeries[];
  hiddenSeries: Set<string>;
  onToggleSeries: (key: string) => void;
  onShowAll?: () => void;
  onHideAll?: () => void;
  controls?: React.ReactNode;
  showSeriesControls?: boolean;
  children: React.ReactNode;
  focusedChildren?: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

function SeriesControls({
  series,
  hiddenSeries,
  onToggleSeries,
  onShowAll,
  onHideAll,
}: Pick<
  PlotCardProps,
  "series" | "hiddenSeries" | "onToggleSeries" | "onShowAll" | "onHideAll"
>) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {series.map((item) => {
        const active = !hiddenSeries.has(item.key);
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={active}
            onClick={() => onToggleSeries(item.key)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
              active
                ? "border-gray-600 bg-gray-800 text-gray-100"
                : "border-gray-800 bg-gray-950/40 text-gray-600 hover:border-gray-700 hover:text-gray-400"
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: active ? item.color : "#4b5563" }}
              aria-hidden="true"
            />
            {item.label}
          </button>
        );
      })}
      {series.length >= 3 && onShowAll && onHideAll && (
        <>
          <button
            type="button"
            onClick={onShowAll}
            className="rounded-md border border-gray-800 bg-gray-950/40 px-2 py-1 text-[11px] font-semibold text-gray-400 transition-colors hover:border-gray-700 hover:bg-gray-900 hover:text-gray-200"
          >
            Show all
          </button>
          <button
            type="button"
            onClick={onHideAll}
            className="rounded-md border border-gray-800 bg-gray-950/40 px-2 py-1 text-[11px] font-semibold text-gray-400 transition-colors hover:border-gray-700 hover:bg-gray-900 hover:text-gray-200"
          >
            Hide all
          </button>
        </>
      )}
    </div>
  );
}

export default function PlotCard({
  title,
  subtitle,
  series,
  hiddenSeries,
  onToggleSeries,
  onShowAll,
  onHideAll,
  controls,
  showSeriesControls = true,
  children,
  focusedChildren,
  collapsible = false,
  defaultCollapsed = false,
}: PlotCardProps) {
  const [focused, setFocused] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    if (!focused) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFocused(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [focused]);

  return (
    <>
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <div
          className={`flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between ${
            collapsible && collapsed ? "" : "mb-3"
          }`}
        >
          <div className="flex min-w-0 items-start gap-2">
            {collapsible && (
              <button
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                aria-expanded={!collapsed}
                aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
                className="mt-0.5 rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] font-semibold leading-none text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                <span
                  className={`inline-block transition-transform ${collapsed ? "" : "rotate-90"}`}
                  aria-hidden="true"
                >
                  ▶
                </span>
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
              {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
            </div>
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 xl:justify-end">
              {showSeriesControls ? (
                <SeriesControls
                  series={series}
                  hiddenSeries={hiddenSeries}
                  onToggleSeries={onToggleSeries}
                  onShowAll={onShowAll}
                  onHideAll={onHideAll}
                />
              ) : null}
              {controls}
              <button
                type="button"
                onClick={() => setFocused(true)}
                className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-[11px] font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                aria-label={`Expand ${title}`}
              >
                Expand
              </button>
            </div>
          )}
        </div>
        {!collapsed && children}
      </section>

      {focused && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} expanded chart`}
        >
          <div className="flex max-h-[92vh] w-full max-w-7xl flex-col rounded-lg border border-gray-700 bg-[#12141d] shadow-2xl">
            <div className="flex flex-col gap-3 border-b border-gray-800 p-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
                {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
              </div>
              <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 xl:justify-end">
                {showSeriesControls ? (
                  <SeriesControls
                    series={series}
                    hiddenSeries={hiddenSeries}
                    onToggleSeries={onToggleSeries}
                    onShowAll={onShowAll}
                    onHideAll={onHideAll}
                  />
                ) : null}
                {controls}
                <button
                  type="button"
                  onClick={() => setFocused(false)}
                  className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-[11px] font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 p-3 sm:p-4">
              {focusedChildren ?? children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
