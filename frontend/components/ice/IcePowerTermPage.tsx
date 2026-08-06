"use client";

import { useMemo, useState } from "react";

import ControlCard from "@/components/dashboard/ControlCard";
import IcePmiCurveTable from "@/components/ice/IcePmiCurveTable";
import {
  DEFAULT_ICE_POWER_TERM_MARKET,
  ICE_POWER_TERM_MARKETS,
  ICE_POWER_TERM_PRODUCTS_BY_MARKET,
  type IcePowerTermMarketId,
} from "@/lib/icePowerTerm/products";

function defaultMonthlyMatrixYears(referenceYear = new Date().getFullYear()): number[] {
  return Array.from({ length: 7 }, (_, index) => referenceYear - 4 + index);
}

export default function IcePowerTermPage() {
  const [market, setMarket] = useState<IcePowerTermMarketId>(
    DEFAULT_ICE_POWER_TERM_MARKET.id,
  );
  const monthlyMatrixYears = useMemo(() => defaultMonthlyMatrixYears(), []);
  const selectedMarket =
    ICE_POWER_TERM_MARKETS.find((option) => option.id === market) ??
    DEFAULT_ICE_POWER_TERM_MARKET;
  const selectedProducts = ICE_POWER_TERM_PRODUCTS_BY_MARKET[selectedMarket.id];

  return (
    <div className="w-full space-y-4">
      <ControlCard title="ICE Power Term">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Filters
            </span>
            <span className="h-px flex-1 bg-gray-800" />
            <span className="text-xs text-gray-500">
              {selectedMarket.label} / {selectedProducts.length} matrices
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Market
            </span>
            {ICE_POWER_TERM_MARKETS.map((option) => {
              const active = market === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setMarket(option.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
                    active
                      ? "border-sky-500/55 bg-sky-500/15 text-sky-100"
                      : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </ControlCard>

      <div className="grid w-full grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
        {selectedProducts.map((matrix) => (
          <IcePmiCurveTable
            key={matrix.root}
            className="min-w-0"
            mode="power"
            powerProduct={matrix.root}
            selectedYears={monthlyMatrixYears}
            title={matrix.title}
            subtitle={matrix.subtitle}
            pairedLayout
            defaultShowTrend={false}
          />
        ))}
      </div>
    </div>
  );
}
