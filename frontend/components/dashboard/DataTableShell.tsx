"use client";

import type React from "react";

interface DataTableShellProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}

export default function DataTableShell({
  title,
  subtitle,
  action,
  className = "",
  bodyClassName = "",
  collapsible = false,
  open = true,
  onToggle,
  children,
}: DataTableShellProps) {
  return (
    <section className={`rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4 ${className}`}>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
        </div>
        {(action || collapsible) && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {action}
            {collapsible && onToggle && (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                {open ? "Collapse" : "Expand"}
              </button>
            )}
          </div>
        )}
      </div>
      {(!collapsible || open) && (
        <div className={`overflow-x-auto rounded-md border border-gray-800 ${bodyClassName}`}>{children}</div>
      )}
    </section>
  );
}
