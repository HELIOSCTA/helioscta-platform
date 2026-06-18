"use client";

import { useState } from "react";

import PjmWeather, { type PjmWeatherFreshnessSummary } from "@/components/pjm/PjmWeather";
import WeatherHourlyTemps, { type WeatherFreshnessSummary } from "@/components/weather/WeatherHourlyTemps";

type WeatherView = "wsi" | "noaa";

export type WeatherDashboardFreshnessSummary = WeatherFreshnessSummary;

const NOAA_SOURCE_FRESHNESS_LABEL = "NOAA METAR";

function mapNoaaFreshness(freshness: PjmWeatherFreshnessSummary): WeatherDashboardFreshnessSummary {
  return {
    status: freshness.status,
    statusClass: freshness.statusClass,
    summary: freshness.summary,
    targetDateLabel: freshness.targetDateLabel,
    observedUpdateLabel: freshness.latestDateLabel,
    forecastUpdateLabel: NOAA_SOURCE_FRESHNESS_LABEL,
    windowLabel: freshness.latestUpdateLabel,
  };
}

export default function WeatherDashboard({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: WeatherDashboardFreshnessSummary) => void;
}) {
  const [view, setView] = useState<WeatherView>("wsi");

  return (
    <div className="space-y-4">
      <div
        className="inline-flex rounded-lg border border-gray-800 bg-[#12141d] p-1 shadow-xl shadow-black/20"
        role="tablist"
        aria-label="Weather provider"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === "wsi"}
          onClick={() => setView("wsi")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            view === "wsi"
              ? "bg-gray-800 text-white"
              : "text-gray-500 hover:bg-gray-900 hover:text-gray-300"
          }`}
        >
          WSI Hourly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "noaa"}
          onClick={() => setView("noaa")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            view === "noaa"
              ? "bg-gray-800 text-white"
              : "text-gray-500 hover:bg-gray-900 hover:text-gray-300"
          }`}
        >
          NOAA METAR
        </button>
      </div>

      {view === "wsi" ? (
        <WeatherHourlyTemps
          refreshToken={refreshToken}
          onFreshnessChange={onFreshnessChange}
        />
      ) : (
        <PjmWeather
          refreshToken={refreshToken}
          onFreshnessChange={(freshness) => onFreshnessChange?.(mapNoaaFreshness(freshness))}
        />
      )}
    </div>
  );
}
