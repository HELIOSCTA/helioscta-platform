"use client";

import type {
  SparkEvolutionResponse,
  SparkEvolutionSnapshotPoint,
} from "@/lib/sparkSpreads/evolution";
import { seasonalYearColor } from "@/components/spark/seasonalColors";

function formatValue(value: number | null, decimals: number, prefix = ""): string {
  if (value === null) return "--";
  return `${prefix}${value.toFixed(decimals)}`;
}

function formatSignedValue(value: number | null, decimals: number): string {
  if (value === null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(decimals)}`;
}

function findNearestPoint(
  series: SparkEvolutionSnapshotPoint[],
  hoveredDte: number,
): SparkEvolutionSnapshotPoint | null {
  if (!series.length) return null;

  let nearest = series[0];
  let nearestDistance = Math.abs(series[0].daysToExpiry - hoveredDte);

  for (const point of series) {
    const distance = Math.abs(point.daysToExpiry - hoveredDte);
    if (distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }

  return nearest;
}

interface SparkSnapshotTableProps {
  data: SparkEvolutionResponse;
  activeYears: number[];
  hoveredDte: number | null;
}

export default function SparkSnapshotTable({
  data,
  activeYears,
  hoveredDte,
}: SparkSnapshotTableProps) {
  const rows = activeYears
    .map((year) => {
      const yearKey = String(year);
      const series = data.seriesByYear[yearKey] ?? [];
      const point = hoveredDte !== null
        ? findNearestPoint(series, hoveredDte)
        : data.latestByYear[yearKey];

      return { year, point };
    })
    .filter((row): row is { year: number; point: SparkEvolutionSnapshotPoint } => row.point !== null);

  if (!rows.length) return null;

  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Spark Snapshot</h2>
          <p className="mt-1 text-xs text-gray-500">
            {hoveredDte !== null
              ? `Nearest readout to hovered ${hoveredDte}d point`
              : "Latest available settlement by active contract year"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-gray-300">
            Trade date: {data.metadata.lastTradeDate ?? "--"}
          </span>
          <span className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-gray-300">
            Updated: {data.metadata.latestUpdatedAt ?? "--"}
          </span>
          <span className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-gray-300">
            Heat rate: {data.metadata.heatRate.toFixed(1)}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-800">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-gray-950/60">
            <tr className="border-b border-gray-800 text-xs uppercase tracking-wider text-gray-500">
              <th className="px-3 py-3 text-left">Year</th>
              <th className="px-3 py-3 text-center">DTE</th>
              <th className="px-3 py-3 text-center">Power</th>
              <th className="px-3 py-3 text-center">Gas</th>
              <th className="px-3 py-3 text-center">Basis</th>
              <th className="px-3 py-3 text-center">All-in Gas</th>
              <th className="px-3 py-3 text-center">Spark Spread</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ year, point }, index) => {
              const accentColor = seasonalYearColor(year);
              return (
                <tr
                  key={year}
                  className={`border-b border-gray-800/50 transition-colors hover:bg-gray-800/30 ${
                    index % 2 === 0 ? "bg-gray-900/20" : ""
                  }`}
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: accentColor }}
                        aria-hidden="true"
                      />
                      <div>
                        <div className="font-semibold text-gray-100">{year}</div>
                        <div className="text-xs text-gray-500">{point.tradeDate}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-gray-300">
                    {point.daysToExpiry}d
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-gray-200">
                    {formatValue(point.power, 2, "$")}
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-orange-300">
                    {formatValue(point.gas, 3, "$")}
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-purple-300">
                    {formatSignedValue(point.basis, 3)}
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-cyan-300">
                    {formatValue(point.allInGas, 3, "$")}
                  </td>
                  <td
                    className={`px-3 py-3 text-center font-mono font-semibold ${
                      point.sparkSpread >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {formatSignedValue(point.sparkSpread, 2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.componentCodes.length > 1 && (
        <p className="mt-3 text-xs text-gray-600">
          {data.monthName} averages component strips: {data.componentCodes.join(", ")}.
        </p>
      )}
    </section>
  );
}
