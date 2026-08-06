"use client";

import { useMemo, useState } from "react";

import ControlCard from "@/components/dashboard/ControlCard";
import IcePmiCurveTable from "@/components/ice/IcePmiCurveTable";

type IcePowerTermMarket = "pjm";

const PJM_MONTHLY_SETTLE_MATRICES = [
  {
    key: "pmi",
    productId: "PJM_WH_RT_TETCO_M3_7X",
    title: "PMI Monthly Matrix",
    subtitle: "PJM Western Hub RT on-peak monthly settles.",
  },
  {
    key: "opj",
    productId: "PJM_WH_RT_OFFPEAK_TETCO_M3_7X",
    title: "OPJ Monthly Matrix",
    subtitle: "PJM Western Hub RT off-peak monthly settles.",
  },
] as const;

function defaultPjmMonthlyMatrixYears(referenceYear = new Date().getFullYear()): number[] {
  return Array.from({ length: 7 }, (_, index) => referenceYear - 4 + index);
}

export default function IcePowerTermPage() {
  const [market, setMarket] = useState<IcePowerTermMarket>("pjm");
  const pjmMonthlyMatrixYears = useMemo(() => defaultPjmMonthlyMatrixYears(), []);

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
              PJM / {PJM_MONTHLY_SETTLE_MATRICES.length} matrices
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Market
            </span>
            <button
              type="button"
              aria-pressed={market === "pjm"}
              onClick={() => setMarket("pjm")}
              className="rounded-full border border-sky-500/55 bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-100 transition-all duration-150"
            >
              PJM
            </button>
          </div>
        </div>
      </ControlCard>

      {market === "pjm" && (
        <div className="grid w-full grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
          {PJM_MONTHLY_SETTLE_MATRICES.map((matrix) => (
            <IcePmiCurveTable
              key={matrix.key}
              className="min-w-0"
              mode="power"
              sparkProduct={matrix.productId}
              selectedYears={pjmMonthlyMatrixYears}
              title={matrix.title}
              subtitle={matrix.subtitle}
              pairedLayout
              defaultShowTrend={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
