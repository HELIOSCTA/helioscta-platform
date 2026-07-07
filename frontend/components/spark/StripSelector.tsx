"use client";

export const STRIP_MONTHS = [
  { code: "F", name: "Jan" },
  { code: "G", name: "Feb" },
  { code: "H", name: "Mar" },
  { code: "J", name: "Apr" },
  { code: "K", name: "May" },
  { code: "M", name: "Jun" },
  { code: "N", name: "Jul" },
  { code: "Q", name: "Aug" },
  { code: "U", name: "Sep" },
  { code: "V", name: "Oct" },
  { code: "X", name: "Nov" },
  { code: "Z", name: "Dec" },
] as const;

export const COMPOSITE_OPTIONS = [
  { code: "JF", name: "Jan-Feb" },
  { code: "JA", name: "Jul-Aug" },
  { code: "Q1", name: "Q1" },
  { code: "Q2", name: "Q2" },
  { code: "Q3", name: "Q3" },
  { code: "Q4", name: "Q4" },
] as const;

interface StripSelectorProps {
  label?: string;
  value: string;
  onChange: (code: string) => void;
}

export default function StripSelector({ label, value, onChange }: StripSelectorProps) {
  function stripButton(code: string, name: string, composite: boolean) {
    const active = value === code;
    const activeColor = composite ? "#a78bfa" : "#f97316";
    return (
      <button
        key={code}
        type="button"
        onClick={() => onChange(code)}
        className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
        style={{
          borderColor: active ? activeColor : "#374151",
          backgroundColor: active ? `${activeColor}33` : "transparent",
          color: active ? activeColor : "#6b7280",
        }}
      >
        {name}
      </button>
    );
  }

  return (
    <div>
      {label ? (
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
          {label}
        </p>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-gray-600">Months</span>
          <span className="h-px flex-1 bg-gray-800" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {STRIP_MONTHS.map(({ code, name }) => stripButton(code, name, false))}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-gray-600">Composites</span>
          <span className="h-px flex-1 bg-gray-800" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {COMPOSITE_OPTIONS.map(({ code, name }) => stripButton(code, name, true))}
        </div>
      </div>
    </div>
  );
}
