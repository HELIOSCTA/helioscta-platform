"use client";

import type { ReactNode } from "react";

interface ControlCardProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export default function ControlCard({
  title,
  children,
  className = "",
}: ControlCardProps) {
  return (
    <section
      className={`w-full max-w-none rounded-lg border border-sky-950/70 bg-[#0d121b] p-3 shadow-xl shadow-black/20 ring-1 ring-white/[0.02] sm:p-4 ${className}`}
    >
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
        {title}
      </h2>
      {children}
    </section>
  );
}
