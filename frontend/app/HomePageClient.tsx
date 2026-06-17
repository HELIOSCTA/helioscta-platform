"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import FreshnessCard from "@/components/dashboard/FreshnessCard";
import PjmDaLmps, { type PjmDaLmpsFreshnessSummary } from "@/components/pjm/PjmDaLmps";
import PjmForecasts, { type PjmForecastsFreshnessSummary } from "@/components/pjm/PjmForecasts";
import PjmOutages, { type PjmOutagesFreshnessSummary } from "@/components/pjm/PjmOutages";
import PjmWeather, { type PjmWeatherFreshnessSummary } from "@/components/pjm/PjmWeather";
import Sidebar, { type ActiveSection } from "@/components/Sidebar";

const DEFAULT_PJM_DA_LMPS_FRESHNESS: PjmDaLmpsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "LMP day --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const DEFAULT_PJM_OUTAGES_FRESHNESS: PjmOutagesFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Outages --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const DEFAULT_PJM_FORECASTS_FRESHNESS: PjmForecastsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Forecasts --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const DEFAULT_PJM_WEATHER_FRESHNESS: PjmWeatherFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Weather --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

function parseInitialSection(value: string | null): ActiveSection {
  if (value === "pjm-forecasts") return "pjm-forecasts";
  if (value === "pjm-outages") return "pjm-outages";
  if (value === "pjm-weather") return "pjm-weather";
  return "pjm-da-lmps";
}

function parseDateParam(value: string | null): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export default function HomePageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<ActiveSection>(
    parseInitialSection(searchParams.get("section")),
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pjmDaLmpsRefreshToken, setPjmDaLmpsRefreshToken] = useState(0);
  const [pjmForecastsRefreshToken, setPjmForecastsRefreshToken] = useState(0);
  const [pjmOutagesRefreshToken, setPjmOutagesRefreshToken] = useState(0);
  const [pjmWeatherRefreshToken, setPjmWeatherRefreshToken] = useState(0);
  const [pjmDaLmpsFreshnessOpen, setPjmDaLmpsFreshnessOpen] = useState(false);
  const [pjmForecastsFreshnessOpen, setPjmForecastsFreshnessOpen] = useState(false);
  const [pjmOutagesFreshnessOpen, setPjmOutagesFreshnessOpen] = useState(false);
  const [pjmWeatherFreshnessOpen, setPjmWeatherFreshnessOpen] = useState(false);
  const [pjmDaLmpsFreshness, setPjmDaLmpsFreshness] =
    useState<PjmDaLmpsFreshnessSummary>(DEFAULT_PJM_DA_LMPS_FRESHNESS);
  const [pjmForecastsFreshness, setPjmForecastsFreshness] =
    useState<PjmForecastsFreshnessSummary>(DEFAULT_PJM_FORECASTS_FRESHNESS);
  const [pjmOutagesFreshness, setPjmOutagesFreshness] =
    useState<PjmOutagesFreshnessSummary>(DEFAULT_PJM_OUTAGES_FRESHNESS);
  const [pjmWeatherFreshness, setPjmWeatherFreshness] =
    useState<PjmWeatherFreshnessSummary>(DEFAULT_PJM_WEATHER_FRESHNESS);

  const initialPjmDaLmpDate = parseDateParam(searchParams.get("date"));

  const replaceRouteState = (section: ActiveSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", section);
    params.delete("forecastView");
    router.replace(`/?${params.toString()}`, { scroll: false });
  };

  const handleSectionChange = (section: ActiveSection) => {
    setActiveSection(section);
    replaceRouteState(section);
  };

  const meta = useMemo(() => {
    if (activeSection === "pjm-forecasts") {
      return {
        title: "Forecasts",
        subtitle: "PJM seven-day load forecasts by area with hourly profiles and daily summaries.",
        footer: "Forecasts | Source: PJM Data Miner / Azure PostgreSQL",
      };
    }
    if (activeSection === "pjm-outages") {
      return {
        title: "Outages",
        subtitle: "PJM generation outage forecast vintages and seasonal outage overlays.",
        footer: "Outages | Source: PJM Data Miner / Azure PostgreSQL",
      };
    }
    if (activeSection === "pjm-weather") {
      return {
        title: "Weather",
        subtitle: "PJM airport METAR observations with station freshness, heatmaps, and short history.",
        footer: "Weather | Source: NOAA AviationWeather METAR / Azure PostgreSQL",
      };
    }
    return {
      title: "Power LMPs",
      subtitle:
        "PJM day-ahead and real-time LMPs with hourly component breakdowns and hub summaries.",
      footer: "Power LMPs | Source: Azure PostgreSQL",
    };
  }, [activeSection]);

  return (
    <div className="flex min-h-screen bg-[#0f1117] text-gray-100">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 overflow-auto">
        <main className="px-3 py-4 sm:px-8 sm:py-8">
          <div className="mb-4 flex items-center gap-3 md:hidden">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="rounded-md border border-gray-800 bg-gray-900/60 p-2 text-gray-300 hover:bg-gray-800 hover:text-white"
              aria-label="Open navigation"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              HeliosCTA
            </p>
            <label className="ml-auto min-w-0 flex-1">
              <span className="sr-only">Dashboard section</span>
              <select
                value={activeSection}
                onChange={(event) => handleSectionChange(event.target.value as ActiveSection)}
                className="w-full rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-200 focus:border-gray-500 focus:outline-none"
              >
                <option value="pjm-da-lmps">LMPs</option>
                <option value="pjm-forecasts">Forecasts</option>
                <option value="pjm-outages">Outages</option>
                <option value="pjm-weather">Weather</option>
              </select>
            </label>
          </div>

          <div className="mb-6 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-start md:justify-between md:gap-6">
            <div>
              <p className="mb-1 hidden text-xs font-semibold uppercase tracking-widest text-gray-500 md:block">
                HeliosCTA
              </p>
              <h1 className="text-xl font-bold text-gray-100 sm:text-3xl">{meta.title}</h1>
              <p className="mt-2 text-sm text-gray-500">{meta.subtitle}</p>
            </div>

            {activeSection === "pjm-da-lmps" && (
              <FreshnessCard
                statusLabel={pjmDaLmpsFreshness.status}
                statusClass={pjmDaLmpsFreshness.statusClass}
                summary={pjmDaLmpsFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: pjmDaLmpsFreshness.status,
                    className: pjmDaLmpsFreshness.statusClass,
                  },
                  { label: "Selected Day", value: pjmDaLmpsFreshness.targetDateLabel },
                  { label: "Latest Day", value: pjmDaLmpsFreshness.latestDateLabel },
                  { label: "Source Update", value: pjmDaLmpsFreshness.latestUpdateLabel },
                ]}
                open={pjmDaLmpsFreshnessOpen}
                onToggle={() => setPjmDaLmpsFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPjmDaLmpsRefreshToken((value) => value + 1)}
              />
            )}

            {activeSection === "pjm-outages" && (
              <FreshnessCard
                statusLabel={pjmOutagesFreshness.status}
                statusClass={pjmOutagesFreshness.statusClass}
                summary={pjmOutagesFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: pjmOutagesFreshness.status,
                    className: pjmOutagesFreshness.statusClass,
                  },
                  { label: "Region", value: pjmOutagesFreshness.targetDateLabel },
                  { label: "Latest Date", value: pjmOutagesFreshness.latestDateLabel },
                  { label: "Source Update", value: pjmOutagesFreshness.latestUpdateLabel },
                ]}
                open={pjmOutagesFreshnessOpen}
                onToggle={() => setPjmOutagesFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPjmOutagesRefreshToken((value) => value + 1)}
              />
            )}

            {activeSection === "pjm-forecasts" && (
              <FreshnessCard
                statusLabel={pjmForecastsFreshness.status}
                statusClass={pjmForecastsFreshness.statusClass}
                summary={pjmForecastsFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: pjmForecastsFreshness.status,
                    className: pjmForecastsFreshness.statusClass,
                  },
                  { label: "Forecast Area", value: pjmForecastsFreshness.targetDateLabel },
                  { label: "Latest Forecast Day", value: pjmForecastsFreshness.latestDateLabel },
                  { label: "Source Update", value: pjmForecastsFreshness.latestUpdateLabel },
                ]}
                open={pjmForecastsFreshnessOpen}
                onToggle={() => setPjmForecastsFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPjmForecastsRefreshToken((value) => value + 1)}
              />
            )}

            {activeSection === "pjm-weather" && (
              <FreshnessCard
                statusLabel={pjmWeatherFreshness.status}
                statusClass={pjmWeatherFreshness.statusClass}
                summary={pjmWeatherFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: pjmWeatherFreshness.status,
                    className: pjmWeatherFreshness.statusClass,
                  },
                  { label: "Region", value: pjmWeatherFreshness.targetDateLabel },
                  { label: "Latest Observation", value: pjmWeatherFreshness.latestDateLabel },
                  { label: "API Timing", value: pjmWeatherFreshness.latestUpdateLabel },
                ]}
                open={pjmWeatherFreshnessOpen}
                onToggle={() => setPjmWeatherFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPjmWeatherRefreshToken((value) => value + 1)}
              />
            )}
          </div>

          {activeSection === "pjm-da-lmps" && (
            <PjmDaLmps
              initialDate={initialPjmDaLmpDate}
              refreshToken={pjmDaLmpsRefreshToken}
              onFreshnessChange={setPjmDaLmpsFreshness}
            />
          )}
          {activeSection === "pjm-forecasts" && (
            <PjmForecasts
              refreshToken={pjmForecastsRefreshToken}
              onFreshnessChange={setPjmForecastsFreshness}
            />
          )}
          {activeSection === "pjm-outages" && (
            <PjmOutages
              refreshToken={pjmOutagesRefreshToken}
              onFreshnessChange={setPjmOutagesFreshness}
            />
          )}
          {activeSection === "pjm-weather" && (
            <PjmWeather
              refreshToken={pjmWeatherRefreshToken}
              onFreshnessChange={setPjmWeatherFreshness}
            />
          )}
          <p className="mt-6 text-center text-xs text-gray-600">{meta.footer}</p>
        </main>
      </div>
    </div>
  );
}
