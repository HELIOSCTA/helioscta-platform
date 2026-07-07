"use client";

import { useEffect, useState, useRef } from "react";

type MultiSelectOption = string | { value: string; label: string };

interface MultiSelectProps {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  width?: string;
  maxSelected?: number;
}

export default function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "Select...",
  width = "w-64",
  maxSelected,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const normalizedOptions = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );

  const labelByValue = new Map(normalizedOptions.map((option) => [option.value, option.label]));

  const filtered = normalizedOptions.filter((option) =>
    `${option.label} ${option.value}`.toLowerCase().includes(filter.toLowerCase())
  );

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      const next = [...selected, option];
      onChange(maxSelected ? next.slice(-maxSelected) : next);
    }
  };

  const buttonText =
    selected.length === 0
      ? placeholder
      : selected.length <= 2
        ? selected.map((value) => labelByValue.get(value) ?? value).join(", ")
        : `${selected.length} selected`;

  return (
    <div className={`${width} relative flex flex-col gap-1`} ref={ref}>
      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </label>
      <button
        onClick={() => setOpen(!open)}
        className="w-full truncate rounded-md border border-gray-600 bg-gray-950 px-3 py-1.5 text-left text-sm text-gray-100 shadow-inner shadow-black/30 focus:border-gray-400 focus:outline-none"
      >
        {selected.length === 0 ? (
          <span className="text-gray-600">{placeholder}</span>
        ) : (
          buttonText
        )}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border border-gray-600 bg-gray-950 shadow-2xl shadow-black/50"
        >
          <div className="sticky top-0 border-b border-gray-700 bg-gray-950 p-2">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search..."
              className="w-full rounded border border-gray-600 bg-[#0d1119] px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:border-gray-400 focus:outline-none"
              autoFocus
            />
          </div>
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="w-full border-b border-gray-700 px-3 py-1.5 text-left text-xs text-gray-400 hover:bg-gray-900 hover:text-gray-100"
            >
              Clear all ({selected.length})
            </button>
          )}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-600">No matches</div>
            ) : (
              filtered.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-gray-200 hover:bg-sky-500/15 hover:text-white"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(option.value)}
                    onChange={() => toggle(option.value)}
                    className="rounded border-gray-600 bg-gray-950 accent-sky-500"
                  />
                  <span className="truncate">{option.label}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
