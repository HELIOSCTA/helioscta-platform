"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import FreshnessCard from "@/components/dashboard/FreshnessCard";
import NavPositions, {
  type NavPositionsFreshnessSummary,
} from "@/components/nav/NavPositions";
import PjmPriceDistributions, {
  type PjmPriceDistributionsFreshnessSummary,
} from "@/components/pjm/PjmPriceDistributions";
import PjmDaLmps, {
  type ComponentSelection as PjmLmpComponentSelection,
  type LmpProduct as PjmLmpProduct,
  type LmpView as PjmLmpView,
  type PjmDaLmpsFreshnessSummary,
  type RtLmpSource as PjmLmpRtSource,
} from "@/components/pjm/PjmDaLmps";
import PjmDaModel, {
  type PjmDaModelFreshnessSummary,
} from "@/components/pjm/PjmDaModel";
import PjmForecasts, {
  type ForecastType,
  type PjmForecastsFreshnessSummary,
} from "@/components/pjm/PjmForecasts";
import PjmGeneration, {
  type PjmGenerationFreshnessSummary,
} from "@/components/pjm/PjmGeneration";
import PjmHistoricalSettlements from "@/components/pjm/PjmHistoricalSettlements";
import PjmLoadGrowth, {
  type PjmLoadGrowthFreshnessSummary,
} from "@/components/pjm/PjmLoadGrowth";
import PjmOutages, { type PjmOutagesFreshnessSummary } from "@/components/pjm/PjmOutages";
import PjmOpsSummary, {
  type PjmOpsSummaryFreshnessSummary,
} from "@/components/pjm/PjmOpsSummary";
import PjmPriceDurationCurves, {
  type PjmPriceDurationCurvesFreshnessSummary,
} from "@/components/pjm/PjmPriceDurationCurves";
import PjmTermBible, { type PjmTermBibleFreshnessSummary } from "@/components/pjm/PjmTermBible";
import WeatherDashboard, {
  type WeatherDashboardFreshnessSummary,
} from "@/components/weather/WeatherDashboard";
import Sidebar, { type ActiveSection } from "@/components/Sidebar";

const DEFAULT_PJM_DA_LMPS_FRESHNESS: PjmDaLmpsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "LMP day --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const DEFAULT_PJM_DA_MODEL_FRESHNESS: PjmDaModelFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "DA model --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
  cutoffLabel: "--",
};

const DEFAULT_PJM_OUTAGES_FRESHNESS: PjmOutagesFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Outages --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const DEFAULT_PJM_PRICE_DURATION_FRESHNESS: PjmPriceDurationCurvesFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Duration curves --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const DEFAULT_PJM_PRICE_DISTRIBUTIONS_FRESHNESS: PjmPriceDistributionsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Price distributions --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const DEFAULT_PJM_GENERATION_FRESHNESS: PjmGenerationFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Generation --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const DEFAULT_PJM_OPS_SUMMARY_FRESHNESS: PjmOpsSummaryFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Ops Sum --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const DEFAULT_PJM_TERM_BIBLE_FRESHNESS: PjmTermBibleFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Term Bible --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const DEFAULT_PJM_LOAD_GROWTH_FRESHNESS: PjmLoadGrowthFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Load-weather --",
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

const DEFAULT_PJM_WEATHER_FRESHNESS: WeatherDashboardFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "WSI weather --",
  targetDateLabel: "--",
  observedUpdateLabel: "--",
  forecastUpdateLabel: "--",
  windowLabel: "--",
};

const DEFAULT_NAV_POSITIONS_FRESHNESS: NavPositionsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Positions --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

interface HomePageClientProps {
  showLocalDevFeatures: boolean;
}

function parseInitialSection(
  value: string | null,
  showLocalDevFeatures: boolean,
): ActiveSection {
  if (value === "pjm-historical-settlements" || value === "pjm-term-bible") {
    return "pjm-historical-settlements";
  }
  if (showLocalDevFeatures && value === "pjm-price-duration-curves") {
    return "pjm-price-duration-curves";
  }
  if (showLocalDevFeatures && value === "nav-positions") {
    return "nav-positions";
  }
  if (showLocalDevFeatures && value === "pjm-generation") {
    return "pjm-generation";
  }
  if (showLocalDevFeatures && value === "pjm-net-load-forecast") {
    return "pjm-forecasts";
  }
  if (showLocalDevFeatures && value === "pjm-weather") return "pjm-weather";
  if (showLocalDevFeatures && value === "pjm-da-model") return "pjm-da-model";
  if (
    showLocalDevFeatures &&
    (value === "pjm-price-distributions" || value === "pjm-actuals-regime-scatter")
  ) {
    return "pjm-price-distributions";
  }
  if (value === "pjm-ops-summary") return "pjm-ops-summary";
  if (value === "pjm-load-growth") return "pjm-load-growth";
  if (value === "pjm-forecasts") return "pjm-forecasts";
  if (value === "pjm-outages") return "pjm-outages";
  return "pjm-da-lmps";
}

function parseInitialForecastType(
  value: string | null,
  section: string | null,
  showLocalDevFeatures: boolean,
): ForecastType {
  if (showLocalDevFeatures && section === "pjm-net-load-forecast") return "netLoad";
  return value === "netLoad" ? "netLoad" : "load";
}

function parseDateParam(value: string | null): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function parsePjmLmpViewParam(value: string | null): PjmLmpView | undefined {
  return value === "single-day" ||
    value === "compare-dates" ||
    value === "compare-hubs" ||
    value === "daily-settles"
    ? value
    : undefined;
}

function parsePjmLmpProductParam(value: string | null): PjmLmpProduct | undefined {
  return value === "da" || value === "rt" || value === "dart" ? value : undefined;
}

function parsePjmLmpRtSourceParam(value: string | null): PjmLmpRtSource | undefined {
  return value === "verified" || value === "unverified" ? value : undefined;
}

function parsePjmLmpComponentParam(
  value: string | null,
): PjmLmpComponentSelection | undefined {
  return value === "all" ||
    value === "energy" ||
    value === "congestion" ||
    value === "loss" ||
    value === "total"
    ? value
    : undefined;
}

function parseTextParam(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseRefreshParam(value: string | null): boolean {
  return value === "1" || value === "true";
}

export default function HomePageClient({
  showLocalDevFeatures,
}: HomePageClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<ActiveSection>(
    parseInitialSection(searchParams.get("section"), showLocalDevFeatures),
  );
  const [pjmDaLmpsRefreshToken, setPjmDaLmpsRefreshToken] = useState(0);
  const [pjmDaModelRefreshToken, setPjmDaModelRefreshToken] = useState(0);
  const [pjmPriceDurationRefreshToken, setPjmPriceDurationRefreshToken] = useState(0);
  const [pjmPriceDistributionsRefreshToken, setPjmPriceDistributionsRefreshToken] =
    useState(0);
  const [pjmGenerationRefreshToken, setPjmGenerationRefreshToken] = useState(0);
  const [pjmOpsSummaryRefreshToken, setPjmOpsSummaryRefreshToken] = useState(0);
  const [pjmTermBibleRefreshToken, setPjmTermBibleRefreshToken] = useState(0);
  const [pjmLoadGrowthRefreshToken, setPjmLoadGrowthRefreshToken] = useState(0);
  const [pjmForecastsRefreshToken, setPjmForecastsRefreshToken] = useState(0);
  const [pjmOutagesRefreshToken, setPjmOutagesRefreshToken] = useState(0);
  const [pjmWeatherRefreshToken, setPjmWeatherRefreshToken] = useState(0);
  const [navPositionsRefreshToken, setNavPositionsRefreshToken] = useState(0);
  const [pjmDaLmpsFreshnessOpen, setPjmDaLmpsFreshnessOpen] = useState(false);
  const [pjmDaModelFreshnessOpen, setPjmDaModelFreshnessOpen] = useState(false);
  const [pjmPriceDurationFreshnessOpen, setPjmPriceDurationFreshnessOpen] = useState(false);
  const [pjmPriceDistributionsFreshnessOpen, setPjmPriceDistributionsFreshnessOpen] =
    useState(false);
  const [pjmGenerationFreshnessOpen, setPjmGenerationFreshnessOpen] = useState(false);
  const [pjmOpsSummaryFreshnessOpen, setPjmOpsSummaryFreshnessOpen] = useState(false);
  const [pjmTermBibleFreshnessOpen, setPjmTermBibleFreshnessOpen] = useState(false);
  const [pjmLoadGrowthFreshnessOpen, setPjmLoadGrowthFreshnessOpen] = useState(false);
  const [pjmForecastsFreshnessOpen, setPjmForecastsFreshnessOpen] = useState(false);
  const [pjmOutagesFreshnessOpen, setPjmOutagesFreshnessOpen] = useState(false);
  const [pjmWeatherFreshnessOpen, setPjmWeatherFreshnessOpen] = useState(false);
  const [navPositionsFreshnessOpen, setNavPositionsFreshnessOpen] = useState(false);
  const [pjmDaLmpsFreshness, setPjmDaLmpsFreshness] =
    useState<PjmDaLmpsFreshnessSummary>(DEFAULT_PJM_DA_LMPS_FRESHNESS);
  const [pjmDaModelFreshness, setPjmDaModelFreshness] =
    useState<PjmDaModelFreshnessSummary>(DEFAULT_PJM_DA_MODEL_FRESHNESS);
  const [pjmPriceDurationFreshness, setPjmPriceDurationFreshness] =
    useState<PjmPriceDurationCurvesFreshnessSummary>(
      DEFAULT_PJM_PRICE_DURATION_FRESHNESS,
    );
  const [pjmPriceDistributionsFreshness, setPjmPriceDistributionsFreshness] =
    useState<PjmPriceDistributionsFreshnessSummary>(
      DEFAULT_PJM_PRICE_DISTRIBUTIONS_FRESHNESS,
    );
  const [pjmGenerationFreshness, setPjmGenerationFreshness] =
    useState<PjmGenerationFreshnessSummary>(DEFAULT_PJM_GENERATION_FRESHNESS);
  const [pjmOpsSummaryFreshness, setPjmOpsSummaryFreshness] =
    useState<PjmOpsSummaryFreshnessSummary>(DEFAULT_PJM_OPS_SUMMARY_FRESHNESS);
  const [pjmTermBibleFreshness, setPjmTermBibleFreshness] =
    useState<PjmTermBibleFreshnessSummary>(DEFAULT_PJM_TERM_BIBLE_FRESHNESS);
  const [pjmLoadGrowthFreshness, setPjmLoadGrowthFreshness] =
    useState<PjmLoadGrowthFreshnessSummary>(DEFAULT_PJM_LOAD_GROWTH_FRESHNESS);
  const [pjmForecastsFreshness, setPjmForecastsFreshness] =
    useState<PjmForecastsFreshnessSummary>(DEFAULT_PJM_FORECASTS_FRESHNESS);
  const [pjmOutagesFreshness, setPjmOutagesFreshness] =
    useState<PjmOutagesFreshnessSummary>(DEFAULT_PJM_OUTAGES_FRESHNESS);
  const [pjmWeatherFreshness, setPjmWeatherFreshness] =
    useState<WeatherDashboardFreshnessSummary>(DEFAULT_PJM_WEATHER_FRESHNESS);
  const [navPositionsFreshness, setNavPositionsFreshness] =
    useState<NavPositionsFreshnessSummary>(DEFAULT_NAV_POSITIONS_FRESHNESS);

  const initialPjmDaLmpDate = parseDateParam(searchParams.get("date"));
  const initialPjmDaLmpView = parsePjmLmpViewParam(searchParams.get("view"));
  const initialPjmDaLmpProduct = parsePjmLmpProductParam(searchParams.get("product"));
  const initialPjmDaLmpRtSource = parsePjmLmpRtSourceParam(
    searchParams.get("source") ?? searchParams.get("rtSource"),
  );
  const initialPjmDaLmpHub = parseTextParam(searchParams.get("hub"));
  const initialPjmDaLmpComponent = parsePjmLmpComponentParam(
    searchParams.get("component"),
  );
  const initialPjmDaLmpRefresh = parseRefreshParam(searchParams.get("refresh"));
  const initialForecastType = parseInitialForecastType(
    searchParams.get("forecastType"),
    searchParams.get("section"),
    showLocalDevFeatures,
  );

  useEffect(() => {
    if (!showLocalDevFeatures || searchParams.get("section") !== "pjm-net-load-forecast") return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("section", "pjm-forecasts");
    params.set("forecastType", "netLoad");
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [router, searchParams, showLocalDevFeatures]);

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
    if (activeSection === "pjm-price-duration-curves") {
      return {
        title: "Price Analytics",
        subtitle: "Historical PJM hourly LMP duration curves by hub, market, component, month, and year.",
        footer: "Price Analytics | Source: PJM hourly LMPs / Azure PostgreSQL",
      };
    }
    if (activeSection === "pjm-historical-settlements") {
      return {
        title: "Historical Settlements",
        subtitle: "Actual hourly power settlements by on-peak, off-peak, and hour ending.",
        footer: "Historical Settlements | Source: PJM hourly LMPs / Azure PostgreSQL",
      };
    }
    if (showLocalDevFeatures && activeSection === "nav-positions") {
      return {
        title: "Positions",
        subtitle:
          "Local DEV position valuation snapshots aggregated by product, with raw rows and product-code rules.",
        footer: "Positions | Source: nav.positions / Azure PostgreSQL",
      };
    }
    if (showLocalDevFeatures && activeSection === "pjm-generation") {
      return {
        title: "Generation",
        subtitle:
          "PJM fuel mix, daily generation capacity, and scheduled generation economic max by operating hour.",
        footer:
          "Generation | Source: PJM Data Miner gen_by_fuel, day_gen_capacity, and rt_and_self_ecomax / Azure PostgreSQL",
      };
    }
    if (activeSection === "pjm-term-bible") {
      return {
        title: "Term Bible",
        subtitle: "PJM LMP monthly term history by hub, market, component, and strip.",
        footer: "Term Bible | Source: PJM hourly LMPs / Azure PostgreSQL",
      };
    }
    if (showLocalDevFeatures && activeSection === "pjm-price-distributions") {
      return {
        title: "Price Distributions",
        subtitle:
          "Forecast-conditioned PJM RT price distributions using load, wind, solar, temperature, and historical prices.",
        footer:
          "Price Distributions | Source: PJM forecasts, actual load/generation, RT LMPs, and WSI weather / Azure PostgreSQL",
      };
    }
    if (activeSection === "pjm-ops-summary") {
      return {
        title: "Ops Sum",
        subtitle:
          "PJM Operations Summary capacity peak, transfer limits, tie flow, and previous-period actuals.",
        footer:
          "Ops Sum | Source: PJM Data Miner Operations Summary feeds / Azure PostgreSQL",
      };
    }
    if (activeSection === "pjm-forecasts") {
      return {
        title: "Forecasts",
        subtitle:
          "PJM load and net-load forecasts by source, with outright vintages and compare-day overlays.",
        footer:
          "Forecasts | Sources: PJM Data Miner + Meteologica hourly forecasts / Azure PostgreSQL",
      };
    }
    if (showLocalDevFeatures && activeSection === "pjm-da-model") {
      return {
        title: "DA Model",
        subtitle:
          "Meteologica Western Hub day-ahead price forecast by selected delivery date.",
        footer:
          "DA Model | Source: Meteologica Western Hub DA price forecast source tables / Azure PostgreSQL",
      };
    }
    if (activeSection === "pjm-outages") {
      return {
        title: "Outages",
        subtitle: "PJM generation outage forecast vintages and seasonal outage overlays.",
        footer: "Outages | Source: PJM Data Miner / Azure PostgreSQL",
      };
    }
    if (activeSection === "pjm-load-growth") {
      return {
        title: "Load Growth",
        subtitle:
          "Limited-history PJM load-weather explorer for promoted preliminary and metered hourly load.",
        footer:
          "Load Growth | Source: PJM Data Miner hourly load + WSI observed weather / Azure PostgreSQL",
      };
    }
    if (activeSection === "pjm-weather") {
      return {
        title: "Weather",
        subtitle: "WSI hourly weather and NOAA METAR observations for PJM station coverage.",
        footer: "Weather | Source: WSI + NOAA AviationWeather / Azure PostgreSQL",
      };
    }
    return {
      title: "Power LMPs",
      subtitle:
        "PJM day-ahead and real-time LMPs with hourly component breakdowns and hub summaries.",
      footer: "Power LMPs | Source: Azure PostgreSQL",
    };
  }, [activeSection, showLocalDevFeatures]);

  const isHistoricalSettlements = activeSection === "pjm-historical-settlements";

  return (
    <div className="flex min-h-screen flex-col bg-[#0f1117] text-gray-100 md:flex-row">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        showLocalDevFeatures={showLocalDevFeatures}
      />

      <div className="min-w-0 flex-1 overflow-auto">
        <main className={`w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8 ${isHistoricalSettlements ? "mx-auto max-w-full md:max-w-7xl" : ""}`}>
          <div className="mb-6 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-start md:justify-between md:gap-6">
            <div className="min-w-0 max-w-full">
              <p className="mb-1 hidden text-xs font-semibold uppercase tracking-widest text-gray-500 md:block">
                {isHistoricalSettlements ? "Helios CTA | Power Markets" : "HeliosCTA"}
              </p>
              <h1 className="text-xl font-bold text-gray-100 sm:text-3xl">{meta.title}</h1>
              <p
                className="mt-2 max-w-full whitespace-normal break-words text-sm text-gray-500 sm:max-w-3xl"
              >
                {isHistoricalSettlements ? (
                  <>
                    <span className="md:hidden">Actual hourly power settlements.</span>
                    <span className="hidden md:inline">{meta.subtitle}</span>
                  </>
                ) : (
                  meta.subtitle
                )}
              </p>
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

            {showLocalDevFeatures && activeSection === "pjm-da-model" && (
              <FreshnessCard
                statusLabel={pjmDaModelFreshness.status}
                statusClass={pjmDaModelFreshness.statusClass}
                summary={pjmDaModelFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: pjmDaModelFreshness.status,
                    className: pjmDaModelFreshness.statusClass,
                  },
                  { label: "Target Date", value: pjmDaModelFreshness.targetDateLabel },
                  { label: "Default Date", value: pjmDaModelFreshness.latestDateLabel },
                  { label: "Cutoff UTC", value: pjmDaModelFreshness.cutoffLabel },
                  { label: "Source Update", value: pjmDaModelFreshness.latestUpdateLabel },
                ]}
                open={pjmDaModelFreshnessOpen}
                onToggle={() => setPjmDaModelFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPjmDaModelRefreshToken((value) => value + 1)}
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

            {activeSection === "pjm-price-duration-curves" && (
              <FreshnessCard
                statusLabel={pjmPriceDurationFreshness.status}
                statusClass={pjmPriceDurationFreshness.statusClass}
                summary={pjmPriceDurationFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: pjmPriceDurationFreshness.status,
                    className: pjmPriceDurationFreshness.statusClass,
                  },
                  { label: "Selection", value: pjmPriceDurationFreshness.targetDateLabel },
                  { label: "Hour Filter", value: pjmPriceDurationFreshness.latestDateLabel },
                  { label: "Source Update", value: pjmPriceDurationFreshness.latestUpdateLabel },
                ]}
                open={pjmPriceDurationFreshnessOpen}
                onToggle={() => setPjmPriceDurationFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPjmPriceDurationRefreshToken((value) => value + 1)}
              />
            )}

            {activeSection === "pjm-term-bible" && (
              <FreshnessCard
                statusLabel={pjmTermBibleFreshness.status}
                statusClass={pjmTermBibleFreshness.statusClass}
                summary={pjmTermBibleFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: pjmTermBibleFreshness.status,
                    className: pjmTermBibleFreshness.statusClass,
                  },
                  { label: "Selection", value: pjmTermBibleFreshness.targetDateLabel },
                  { label: "Data Window", value: pjmTermBibleFreshness.latestDateLabel },
                  { label: "Source Update", value: pjmTermBibleFreshness.latestUpdateLabel },
                ]}
                open={pjmTermBibleFreshnessOpen}
                onToggle={() => setPjmTermBibleFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPjmTermBibleRefreshToken((value) => value + 1)}
              />
            )}

            {showLocalDevFeatures && activeSection === "nav-positions" && (
              <FreshnessCard
                statusLabel={navPositionsFreshness.status}
                statusClass={navPositionsFreshness.statusClass}
                summary={navPositionsFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: navPositionsFreshness.status,
                    className: navPositionsFreshness.statusClass,
                  },
                  { label: "Selected Date", value: navPositionsFreshness.targetDateLabel },
                  { label: "Latest Date", value: navPositionsFreshness.latestDateLabel },
                  { label: "Latest Upload", value: navPositionsFreshness.latestUpdateLabel },
                ]}
                open={navPositionsFreshnessOpen}
                onToggle={() => setNavPositionsFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setNavPositionsRefreshToken((value) => value + 1)}
              />
            )}

            {showLocalDevFeatures && activeSection === "pjm-generation" && (
              <FreshnessCard
                statusLabel={pjmGenerationFreshness.status}
                statusClass={pjmGenerationFreshness.statusClass}
                summary={pjmGenerationFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: pjmGenerationFreshness.status,
                    className: pjmGenerationFreshness.statusClass,
                  },
                  { label: "Selected Day", value: pjmGenerationFreshness.targetDateLabel },
                  { label: "Latest Common Day", value: pjmGenerationFreshness.latestDateLabel },
                  { label: "Source Update", value: pjmGenerationFreshness.latestUpdateLabel },
                ]}
                open={pjmGenerationFreshnessOpen}
                onToggle={() => setPjmGenerationFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPjmGenerationRefreshToken((value) => value + 1)}
              />
            )}

            {showLocalDevFeatures && activeSection === "pjm-price-distributions" && (
              <FreshnessCard
                statusLabel={pjmPriceDistributionsFreshness.status}
                statusClass={pjmPriceDistributionsFreshness.statusClass}
                summary={pjmPriceDistributionsFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: pjmPriceDistributionsFreshness.status,
                    className: pjmPriceDistributionsFreshness.statusClass,
                  },
                  { label: "Selection", value: pjmPriceDistributionsFreshness.targetDateLabel },
                  { label: "Window", value: pjmPriceDistributionsFreshness.latestDateLabel },
                  { label: "Source Update", value: pjmPriceDistributionsFreshness.latestUpdateLabel },
                ]}
                open={pjmPriceDistributionsFreshnessOpen}
                onToggle={() => setPjmPriceDistributionsFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPjmPriceDistributionsRefreshToken((value) => value + 1)}
              />
            )}

            {activeSection === "pjm-ops-summary" && (
              <FreshnessCard
                statusLabel={pjmOpsSummaryFreshness.status}
                statusClass={pjmOpsSummaryFreshness.statusClass}
                summary={pjmOpsSummaryFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: pjmOpsSummaryFreshness.status,
                    className: pjmOpsSummaryFreshness.statusClass,
                  },
                  { label: "Date", value: pjmOpsSummaryFreshness.targetDateLabel },
                  { label: "Projected Peak", value: pjmOpsSummaryFreshness.latestDateLabel },
                  { label: "Source Update", value: pjmOpsSummaryFreshness.latestUpdateLabel },
                ]}
                open={pjmOpsSummaryFreshnessOpen}
                onToggle={() => setPjmOpsSummaryFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPjmOpsSummaryRefreshToken((value) => value + 1)}
              />
            )}

            {activeSection === "pjm-load-growth" && (
              <FreshnessCard
                statusLabel={pjmLoadGrowthFreshness.status}
                statusClass={pjmLoadGrowthFreshness.statusClass}
                summary={pjmLoadGrowthFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: pjmLoadGrowthFreshness.status,
                    className: pjmLoadGrowthFreshness.statusClass,
                  },
                  { label: "Selection", value: pjmLoadGrowthFreshness.targetDateLabel },
                  { label: "Data As Of", value: pjmLoadGrowthFreshness.latestDateLabel },
                  { label: "Weather Update", value: pjmLoadGrowthFreshness.latestUpdateLabel },
                ]}
                open={pjmLoadGrowthFreshnessOpen}
                onToggle={() => setPjmLoadGrowthFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPjmLoadGrowthRefreshToken((value) => value + 1)}
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
                  { label: "Observed End", value: pjmWeatherFreshness.targetDateLabel },
                  { label: "Observed Update", value: pjmWeatherFreshness.observedUpdateLabel },
                  { label: "Forecast Update", value: pjmWeatherFreshness.forecastUpdateLabel },
                  { label: "Window", value: pjmWeatherFreshness.windowLabel },
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
              initialView={initialPjmDaLmpView}
              initialProduct={initialPjmDaLmpProduct}
              initialRtSource={initialPjmDaLmpRtSource}
              initialHub={initialPjmDaLmpHub}
              initialComponent={initialPjmDaLmpComponent}
              refreshToken={pjmDaLmpsRefreshToken + (initialPjmDaLmpRefresh ? 1 : 0)}
              onFreshnessChange={setPjmDaLmpsFreshness}
            />
          )}
          {showLocalDevFeatures && activeSection === "pjm-da-model" && (
            <PjmDaModel
              refreshToken={pjmDaModelRefreshToken}
              onFreshnessChange={setPjmDaModelFreshness}
            />
          )}
          {activeSection === "pjm-price-duration-curves" && (
            <PjmPriceDurationCurves
              refreshToken={pjmPriceDurationRefreshToken}
              onFreshnessChange={setPjmPriceDurationFreshness}
            />
          )}
          {activeSection === "pjm-historical-settlements" && (
            <PjmHistoricalSettlements
              initialTab={searchParams.get("section") === "pjm-term-bible" ? "term-bible" : "settlements"}
            />
          )}
          {showLocalDevFeatures && activeSection === "nav-positions" && (
            <NavPositions
              refreshToken={navPositionsRefreshToken}
              onFreshnessChange={setNavPositionsFreshness}
            />
          )}
          {showLocalDevFeatures && activeSection === "pjm-generation" && (
            <PjmGeneration
              refreshToken={pjmGenerationRefreshToken}
              onFreshnessChange={setPjmGenerationFreshness}
            />
          )}
          {activeSection === "pjm-term-bible" && (
            <PjmTermBible
              refreshToken={pjmTermBibleRefreshToken}
              onFreshnessChange={setPjmTermBibleFreshness}
            />
          )}
          {showLocalDevFeatures && activeSection === "pjm-price-distributions" && (
            <PjmPriceDistributions
              refreshToken={pjmPriceDistributionsRefreshToken}
              onFreshnessChange={setPjmPriceDistributionsFreshness}
            />
          )}
          {activeSection === "pjm-ops-summary" && (
            <PjmOpsSummary
              refreshToken={pjmOpsSummaryRefreshToken}
              onFreshnessChange={setPjmOpsSummaryFreshness}
            />
          )}
          {activeSection === "pjm-load-growth" && (
            <PjmLoadGrowth
              refreshToken={pjmLoadGrowthRefreshToken}
              onFreshnessChange={setPjmLoadGrowthFreshness}
            />
          )}
          {activeSection === "pjm-forecasts" && (
            <PjmForecasts
              initialForecastType={initialForecastType}
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
            <WeatherDashboard
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
