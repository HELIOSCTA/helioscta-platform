"use client";

export interface FreshnessCardItem {
  label: string;
  value: string;
  className?: string;
}

interface FreshnessCardProps {
  statusLabel: string;
  statusClass: string;
  summary: string;
  items: FreshnessCardItem[];
  open: boolean;
  onToggle: () => void;
  actionLabel?: string;
  onAction?: () => void;
  showStatusBadge?: boolean;
}

export default function FreshnessCard({
  statusLabel,
  statusClass,
  summary,
  items,
  open,
  onToggle,
  actionLabel,
  onAction,
  showStatusBadge = true,
}: FreshnessCardProps) {
  return (
    <div className="w-fit max-w-full rounded-lg border border-gray-800 bg-[#12141d] shadow-xl shadow-black/20">
      <div className="flex w-full min-w-0 items-center justify-between gap-3 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="min-w-0 flex-1 text-left transition-colors"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Freshness
              </span>
              {showStatusBadge && (
                <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}>
                  {statusLabel}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">{summary}</p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {onAction && actionLabel && (
            <button
              type="button"
              onClick={onAction}
              className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              {actionLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onToggle}
            className="text-xs text-gray-500 transition-colors hover:text-gray-300"
          >
            {open ? "Hide v" : "Show >"}
          </button>
        </div>
      </div>
      {open && (
        <div className="flex min-w-0 flex-wrap items-stretch gap-2 border-t border-gray-800 p-2">
          {items.map((item) => (
            <div
              key={item.label}
              className={`rounded-md border px-2.5 py-2 ${
                item.className ?? "border-gray-800 bg-gray-950/40"
              }`}
            >
              <p className={`text-[10px] font-bold uppercase tracking-wider ${
                item.className ? "opacity-80" : "text-gray-500"
              }`}>
                {item.label}
              </p>
              <p className={`mt-1 text-sm font-semibold break-words ${
                item.className ? "" : "text-gray-200"
              }`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
