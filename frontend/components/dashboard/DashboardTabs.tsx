"use client";

export interface DashboardTabOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface DashboardTabsProps<T extends string> {
  tabs: Array<DashboardTabOption<T>>;
  activeValue: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  variant?: "primary" | "secondary";
  className?: string;
}

const VARIANT_CLASSES = {
  primary: {
    list: "gap-1",
    active: "border-sky-500/50 bg-sky-500/10 text-white",
    inactive:
      "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300",
  },
  secondary: {
    list: "gap-1",
    active: "border-cyan-500/40 bg-cyan-500/10 text-cyan-100",
    inactive:
      "border-gray-800 bg-gray-950/30 text-gray-500 hover:border-gray-700 hover:text-gray-300",
  },
} as const;

export default function DashboardTabs<T extends string>({
  tabs,
  activeValue,
  onChange,
  ariaLabel,
  variant = "primary",
  className = "",
}: DashboardTabsProps<T>) {
  const classes = VARIANT_CLASSES[variant];

  return (
    <div
      className={`flex flex-wrap ${classes.list} ${className}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const active = activeValue === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={tab.disabled}
            onClick={() => onChange(tab.value)}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              active ? classes.active : classes.inactive
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
