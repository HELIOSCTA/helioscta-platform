"use client";

import { useEffect, useState, useRef } from "react";

interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  width?: string;
}

export default function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "Select...",
  width = "w-64",
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

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(filter.toLowerCase())
  );

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const buttonText =
    selected.length === 0
      ? placeholder
      : selected.length <= 2
        ? selected.join(", ")
        : `${selected.length} selected`;

  return (
    <div className={`${width} relative flex flex-col gap-1`} ref={ref}>
      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </label>
      <button
        onClick={() => setOpen(!open)}
        className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-left text-sm text-gray-200 truncate focus:border-gray-500 focus:outline-none"
      >
        {selected.length === 0 ? (
          <span className="text-gray-600">{placeholder}</span>
        ) : (
          buttonText
        )}
      </button>
      {open && (
        <div
          className="absolute top-full left-0 z-50 mt-1 w-full rounded-md border border-gray-700 bg-[#12141d] shadow-xl"
        >
          <div className="sticky top-0 bg-[#12141d] p-2 border-b border-gray-700">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search..."
              className="w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none"
              autoFocus
            />
          </div>
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="w-full px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 text-left border-b border-gray-700"
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
                  key={option}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => toggle(option)}
                    className="rounded accent-blue-500"
                  />
                  <span className="truncate">{option}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
