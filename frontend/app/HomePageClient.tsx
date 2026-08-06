"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import DashboardTabs, { type DashboardTabOption } from "@/components/dashboard/DashboardTabs";
import FreshnessCard from "@/components/dashboard/FreshnessCard";
import EiaGenerationDashboard, {
  type EiaGenerationFreshnessSummary,
} from "@/components/eia/EiaGenerationDashboard";
import ClearStreetTrades, {
  type ClearStreetTradesFreshnessSummary,
} from "@/components/clear-street/ClearStreetTrades";
import GasDailyPrices, {
  type GasDailyPricesFreshnessSummary,
} from "@/components/gas/GasDailyPrices";
import GasCurveEvolution from "@/components/gas/GasCurveEvolution";
import CriterionNomsDashboard, {
  type CriterionNomsFreshnessSummary,
} from "@/components/gas/CriterionNomsDashboard";
import GenscapeMapExplorer from "@/components/gas/GenscapeMapExplorer";
import GenscapeNomsDashboard from "@/components/gas/GenscapeNomsDashboard";
import type { GenscapeNomsFreshnessSummary } from "@/components/gas/GenscapeNomsReport";
import GtnPipelineBalance from "@/components/gas/GtnPipelineBalance";
import IcePowerTermPage from "@/components/ice/IcePowerTermPage";
import IceTradeBlotter, {
  type IceTradeBlotterFreshnessSummary,
} from "@/components/positions/IceTradeBlotter";
import PositionsHome, {
  type PositionsHomeFreshnessSummary,
} from "@/components/positions/PositionsHome";
import RawIceTradeBlotter, {
  type RawIceTradeBlotterFreshnessSummary,
} from "@/components/positions/RawIceTradeBlotter";
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
  type PowerIso as PjmLmpIso,
  type RtLmpSource as PjmLmpRtSource,
} from "@/components/pjm/PjmDaLmps";
import PowerSettlesDashboard from "@/components/pjm/PowerSettlesDashboard";
import PjmDaMeteoBaselinePrice from "@/components/pjm/PjmDaMeteoBaselinePrice";
import PowerLmpAdders, {
  type PowerIso as LmpAdderIso,
  type PowerLmpAddersFreshnessSummary,
} from "@/components/pjm/PowerLmpAdders";
import PjmForecasts, {
  type ForecastMode,
  type NetLoadForecastComponent,
  type NetLoadForecastStatistic,
  type ForecastSourceMode,
  type ForecastType,
  type PjmForecastsFreshnessSummary,
} from "@/components/pjm/PjmForecasts";
import PjmForecastReports, {
  type PjmForecastReportsFreshnessSummary,
} from "@/components/pjm/PjmForecastReports";
import PjmGeneration, {
  type PjmGenerationFreshnessSummary,
} from "@/components/pjm/PjmGeneration";
import PjmHistoricalSettlements from "@/components/pjm/PjmHistoricalSettlements";
import PjmLoadGrowth, {
  type PjmLoadGrowthFreshnessSummary,
} from "@/components/pjm/PjmLoadGrowth";
import PjmOutages, { type PjmOutagesFreshnessSummary } from "@/components/pjm/PjmOutages";
import PjmConstraints, {
  type PjmConstraintsFreshnessSummary,
} from "@/components/pjm/PjmConstraints";
import PjmOpsSummary, {
  type PjmOpsSummaryFreshnessSummary,
} from "@/components/pjm/PjmOpsSummary";
import {
  defaultPowerLmpGasHubForIso,
  parsePowerLmpGasHubKey,
  parsePowerLmpMetricMode,
  parsePowerLmpSparkHeatRate,
  type PjmHeatRateGasHubKey,
  type PowerLmpMetricMode,
} from "@/lib/powerLmpHeatRate";
import PjmTightnessLookback, {
  type PjmTightnessLookbackFreshnessSummary,
} from "@/components/pjm/PjmTightnessLookback";
import PjmPriceDurationCurves, {
  type PjmPriceDurationCurvesFreshnessSummary,
} from "@/components/pjm/PjmPriceDurationCurves";
import PjmTermBible, { type PjmTermBibleFreshnessSummary } from "@/components/pjm/PjmTermBible";
import WeatherDashboard, {
  type WeatherDashboardFreshnessSummary,
} from "@/components/weather/WeatherDashboard";
import ShortTermWeatherDashboard from "@/components/weather/ShortTermWeatherDashboard";
import WsiWeatherDashboard from "@/components/weather/WsiWeatherDashboard";
import WsiWeatherReportDashboard from "@/components/weather/WsiWeatherReportDashboard";
import Sidebar, { type ActiveSection } from "@/components/Sidebar";
import SparkSpreadEvolution from "@/components/spark/SparkSpreadEvolution";
import SaltsDashboard, {
  parseSaltsTabFromView,
  saltsChromeForTab,
  viewForSaltsTab,
  type SaltsTab,
} from "@/components/salts/SaltsDashboard";
import BackOfficeHome from "@/components/backoffice/BackOfficeHome";
import BackOfficePositionsTrades from "@/components/backoffice/BackOfficePositionsTrades";
import BackOfficeMonitor from "@/components/backoffice/BackOfficeMonitor";
import BackOfficeTradePipeline from "@/components/backoffice/BackOfficeTradePipeline";
import BackOfficeNavDailyPositionSheet from "@/components/backoffice/BackOfficeNavDailyPositionSheet";

const DEFAULT_PJM_DA_LMPS_FRESHNESS: PjmDaLmpsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "LMP day --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const DEFAULT_POWER_LMP_ADDERS_FRESHNESS: PowerLmpAddersFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "LMP adders --",
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

const DEFAULT_PJM_CONSTRAINTS_FRESHNESS: PjmConstraintsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Constraints --",
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

const DEFAULT_EIA_GENERATION_FRESHNESS: EiaGenerationFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "EIA generation --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const DEFAULT_PJM_TIGHTNESS_LOOKBACK_FRESHNESS: PjmTightnessLookbackFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Tightness --",
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

const DEFAULT_PJM_FORECAST_REPORTS_FRESHNESS: PjmForecastReportsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Forecast reports --",
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
  summary: "NAV Positions --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const DEFAULT_POSITIONS_HOME_FRESHNESS: PositionsHomeFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Positions health --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const DEFAULT_RAW_ICE_BLOTTER_FRESHNESS: RawIceTradeBlotterFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Trade Blotter --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
  rowCountLabel: "--",
};

const DEFAULT_CLEAR_STREET_TRADES_FRESHNESS: ClearStreetTradesFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Clear Street Trades --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const DEFAULT_ICE_SETTLEMENTS_FRESHNESS: IceTradeBlotterFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "ICE trade blotter --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
  rowCountLabel: "--",
};

const DEFAULT_GAS_DAILY_PRICES_FRESHNESS: GasDailyPricesFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-950/40 text-gray-400",
  summary: "Gas pricing --",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
  fieldLabel: "Cash VWAP | BalMo VWAP | Contracts Settlement",
  rowCountLabel: "--",
};

const DEFAULT_GENSCAPE_NOMS_FRESHNESS: GenscapeNomsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  latestGasDayLabel: "--",
  latestUpdateLabel: "--",
};

const DEFAULT_CRITERION_NOMS_FRESHNESS: CriterionNomsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Criterion nominations --",
  targetDateLabel: "--",
  latestUpdateLabel: "--",
  rowCountLabel: "--",
  scopeLabel: "--",
};

interface HomePageClientProps {
  showLocalDevFeatures: boolean;
}

type LmpHeatRateWorkspaceView = "da-hr" | "rt-hr";
type LmpSparkWorkspaceView = "da-spark" | "rt-spark";
type LmpWorkspaceView = PjmLmpProduct | LmpHeatRateWorkspaceView | LmpSparkWorkspaceView | "adders";

const LMP_WORKSPACE_TABS: Array<DashboardTabOption<LmpWorkspaceView>> = [
  { value: "da", label: "DA LMPs" },
  { value: "rt", label: "RT LMPs" },
  { value: "dart", label: "DART LMPs" },
  { value: "da-hr", label: "DA HR" },
  { value: "rt-hr", label: "RT HR" },
  { value: "da-spark", label: "DA Spark" },
  { value: "rt-spark", label: "RT Spark" },
  { value: "adders", label: "Adders & Reserves" },
];

const LMP_ISO_TABS: Array<DashboardTabOption<PjmLmpIso>> = [
  { value: "pjm", label: "PJM" },
  { value: "ercot", label: "ERCOT" },
  { value: "isone", label: "ISO-NE" },
  { value: "caiso", label: "CAISO" },
  { value: "miso", label: "MISO" },
  { value: "spp", label: "SPP" },
  { value: "nyiso", label: "NYISO" },
];

const BACKOFFICE_SECTION_ALIASES: Record<string, ActiveSection> = {
  "backoffice-home": "backoffice-home",
  "backoffice-positions-trades": "backoffice-positions-trades",
  "backoffice-monitor": "backoffice-monitor",
  "backoffice-trade-pipeline": "backoffice-trade-pipeline",
  "backoffice-nav-daily-position-sheet": "backoffice-nav-daily-position-sheet",
  "ice-trade-blotter": "ice-trade-blotter",
};

const BACKOFFICE_SECTIONS = new Set<ActiveSection>([
  "backoffice-home",
  "backoffice-positions-trades",
  "backoffice-monitor",
  "backoffice-trade-pipeline",
  "backoffice-nav-daily-position-sheet",
  "ice-trade-blotter",
]);

function parseBackOfficeSection(value: string | null): ActiveSection | null {
  if (!value) return null;
  return BACKOFFICE_SECTION_ALIASES[value] ?? null;
}

function isBackOfficeSection(section: ActiveSection): boolean {
  return BACKOFFICE_SECTIONS.has(section);
}

function parseInitialSection(
  value: string | null,
  viewValue: string | null,
  showLocalDevFeatures: boolean,
): ActiveSection {
  const backOfficeSection = parseBackOfficeSection(value) ?? parseBackOfficeSection(viewValue);
  if (backOfficeSection) {
    return backOfficeSection;
  }
  if (value === "power-settles-dashboard") {
    return "power-settles-dashboard";
  }
  if (value === "pjm-da-lmps" || value === "power-lmp-adders") {
    return "pjm-da-lmps";
  }
  if (value === "pjm-historical-settlements" || value === "pjm-term-bible") {
    return "pjm-historical-settlements";
  }
  if (showLocalDevFeatures && value === "pjm-price-duration-curves") {
    return "pjm-price-duration-curves";
  }
  if (showLocalDevFeatures && value === "positions-home") {
    return "positions-home";
  }
  if (showLocalDevFeatures && value === "nav-positions") {
    return "nav-positions";
  }
  if (showLocalDevFeatures && value === "clear-street-trades") {
    return "clear-street-trades";
  }
  if (value === "ice-power-short-term" || value === "ice-settlements") {
    return "ice-power-short-term";
  }
  if (value === "ice-power-term" || value === "ice-pmi-curve") {
    return "ice-power-term";
  }
  if (value === "spark-spreads") {
    return "spark-spreads";
  }
  if (showLocalDevFeatures && (value === "map" || value === "rt")) {
    return "map";
  }
  if (showLocalDevFeatures && value === "noms") {
    return "noms";
  }
  if (showLocalDevFeatures && value === "criterion-noms") {
    return "criterion-noms";
  }
  if (showLocalDevFeatures && value === "gtn-balance") {
    return "gtn-balance";
  }
  if (value === "gas-prices") {
    return "gas-prices";
  }
  if (
    value === "gas-outright" ||
    (!value && (viewValue === "gas-outright" || viewValue === "cal-spread"))
  ) {
    return "gas-outright";
  }
  if (showLocalDevFeatures && (value === "salts" || parseSaltsTabFromView(viewValue))) {
    return "salts";
  }
  if (value === "eia-generation" || viewValue === "eia-generation") {
    return "eia-generation";
  }
  if (showLocalDevFeatures && value === "pjm-generation") {
    return "pjm-generation";
  }
  if (
    showLocalDevFeatures &&
    (value === "pjm-da-model" || value === "pjm-da-meteo-baseline-price")
  ) {
    return "pjm-da-model";
  }
  if (showLocalDevFeatures && value === "pjm-tightness-lookback") {
    return "pjm-tightness-lookback";
  }
  if (showLocalDevFeatures && value === "pjm-net-load-forecast") {
    return "pjm-forecasts";
  }
  if (showLocalDevFeatures && value === "pjm-weather") return "pjm-weather";
  if (showLocalDevFeatures && value === "wsi-weather") return "wsi-weather";
  if (showLocalDevFeatures && value === "wsi-weather-report") return "wsi-weather-report";
  if (showLocalDevFeatures && value === "weather-short-term") return "weather-short-term";
  if (
    showLocalDevFeatures &&
    (value === "pjm-price-distributions" || value === "pjm-actuals-regime-scatter")
  ) {
    return "pjm-price-distributions";
  }
  if (value === "pjm-ops-summary") return "pjm-ops-summary";
  if (value === "pjm-load-growth") return "pjm-load-growth";
  if (value === "pjm-forecasts") return "pjm-forecasts";
  if (showLocalDevFeatures && value === "pjm-forecast-reports") return "pjm-forecast-reports";
  if (value === "pjm-outages") return "pjm-outages";
  if (value === "pjm-constraints") return "pjm-constraints";
  return "power-settles-dashboard";
}

function parseLmpWorkspaceView(
  section: string | null,
  viewValue: string | null,
  productValue: string | null,
  metricValue: string | null,
): LmpWorkspaceView {
  if (section === "power-lmp-adders" || viewValue === "adders") return "adders";
  const product = parsePjmLmpProductParam(productValue) ?? "da";
  if (
    product !== "dart" &&
    parsePowerLmpMetricMode(metricValue) === "heat-rate"
  ) {
    return product === "rt" ? "rt-hr" : "da-hr";
  }
  if (
    product !== "dart" &&
    parsePowerLmpMetricMode(metricValue) === "spark-spread"
  ) {
    return product === "rt" ? "rt-spark" : "da-spark";
  }
  return product;
}

function isLmpHeatRateWorkspaceView(view: LmpWorkspaceView): view is LmpHeatRateWorkspaceView {
  return view === "da-hr" || view === "rt-hr";
}

function isLmpSparkWorkspaceView(view: LmpWorkspaceView): view is LmpSparkWorkspaceView {
  return view === "da-spark" || view === "rt-spark";
}

function productForLmpWorkspaceView(view: LmpWorkspaceView): PjmLmpProduct {
  if (view === "rt-hr" || view === "rt-spark") return "rt";
  if (view === "da-hr" || view === "da-spark" || view === "adders") return "da";
  return view;
}

function metricModeForLmpWorkspaceView(view: LmpWorkspaceView): PowerLmpMetricMode {
  if (isLmpSparkWorkspaceView(view)) return "spark-spread";
  return isLmpHeatRateWorkspaceView(view) ? "heat-rate" : "price";
}

function parseInitialForecastType(
  value: string | null,
  section: string | null,
  showLocalDevFeatures: boolean,
): ForecastType {
  if (showLocalDevFeatures && section === "pjm-net-load-forecast") return "netLoad";
  return value === "netLoad" ? "netLoad" : "load";
}

function parseForecastSourceModeParam(value: string | null): ForecastSourceMode | undefined {
  return value === "pjm" || value === "meteologica" ? value : undefined;
}

function parseForecastModeParam(value: string | null): ForecastMode | undefined {
  return value === "outright" || value === "compareDay" ? value : undefined;
}

function parseNetLoadForecastComponentParam(
  value: string | null,
): NetLoadForecastComponent | undefined {
  return value === "load" || value === "wind" || value === "solar" || value === "netLoad"
    ? value
    : undefined;
}

function parseNetLoadForecastStatisticParam(
  value: string | null,
): NetLoadForecastStatistic | undefined {
  return value === "peak" || value === "onPeak" || value === "offPeak" || value === "flat"
    ? value
    : undefined;
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

function parsePjmLmpIsoParam(value: string | null): PjmLmpIso | undefined {
  return value === "pjm" ||
    value === "ercot" ||
    value === "isone" ||
    value === "caiso" ||
    value === "miso" ||
    value === "spp" ||
    value === "nyiso"
    ? value
    : undefined;
}

function isLmpAdderIso(value: PjmLmpIso): value is LmpAdderIso {
  return value === "pjm" || value === "ercot";
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

function parseNumberCsvParam(value: string | null): number[] {
  return (
    value
      ?.split(",")
      .map((item) => Number.parseInt(item.trim(), 10))
      .filter((item) => Number.isFinite(item) && item > 0) ?? []
  );
}

function parseRefreshParam(value: string | null): boolean {
  return value === "1" || value === "true";
}

export default function HomePageClient({
  showLocalDevFeatures,
}: HomePageClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const routeSection = parseInitialSection(
    searchParams.get("section"),
    searchParams.get("view"),
    showLocalDevFeatures,
  );
  const rawRouteLmpWorkspaceIso = parsePjmLmpIsoParam(searchParams.get("iso")) ?? "pjm";
  const routeLmpWorkspaceView = parseLmpWorkspaceView(
    searchParams.get("section"),
    searchParams.get("view"),
    searchParams.get("product"),
    searchParams.get("metric"),
  );
  const routeLmpWorkspaceIso =
    routeLmpWorkspaceView === "adders" && !isLmpAdderIso(rawRouteLmpWorkspaceIso)
      ? "pjm"
      : rawRouteLmpWorkspaceIso;
  const initialPjmDaLmpHub = parseTextParam(searchParams.get("hub"));
  const routeLmpGasHubParam = searchParams.get("gasHub");
  const routeLmpGasHub =
    parsePowerLmpGasHubKey(routeLmpGasHubParam) ??
    defaultPowerLmpGasHubForIso(routeLmpWorkspaceIso, initialPjmDaLmpHub);
  const routeLmpSparkHeatRate = parsePowerLmpSparkHeatRate(
    searchParams.get("sparkHeatRate"),
  );
  const [activeSection, setActiveSection] = useState<ActiveSection>(routeSection);
  const [lmpWorkspaceView, setLmpWorkspaceView] =
    useState<LmpWorkspaceView>(routeLmpWorkspaceView);
  const [lmpWorkspaceIso, setLmpWorkspaceIso] =
    useState<PjmLmpIso>(routeLmpWorkspaceIso);
  const [lmpGasHub, setLmpGasHub] =
    useState<PjmHeatRateGasHubKey>(routeLmpGasHub);
  const [lmpSparkHeatRate, setLmpSparkHeatRate] =
    useState(routeLmpSparkHeatRate);
  const [pjmDaLmpsRefreshToken, setPjmDaLmpsRefreshToken] = useState(0);
  const [powerLmpAddersRefreshToken, setPowerLmpAddersRefreshToken] = useState(0);
  const [pjmPriceDurationRefreshToken, setPjmPriceDurationRefreshToken] = useState(0);
  const [pjmPriceDistributionsRefreshToken, setPjmPriceDistributionsRefreshToken] =
    useState(0);
  const [pjmGenerationRefreshToken, setPjmGenerationRefreshToken] = useState(0);
  const [eiaGenerationRefreshToken, setEiaGenerationRefreshToken] = useState(0);
  const [pjmTightnessLookbackRefreshToken, setPjmTightnessLookbackRefreshToken] =
    useState(0);
  const [pjmOpsSummaryRefreshToken, setPjmOpsSummaryRefreshToken] = useState(0);
  const [pjmTermBibleRefreshToken, setPjmTermBibleRefreshToken] = useState(0);
  const [pjmLoadGrowthRefreshToken, setPjmLoadGrowthRefreshToken] = useState(0);
  const [pjmForecastsRefreshToken, setPjmForecastsRefreshToken] = useState(0);
  const [pjmForecastReportsRefreshToken, setPjmForecastReportsRefreshToken] = useState(0);
  const [pjmOutagesRefreshToken, setPjmOutagesRefreshToken] = useState(0);
  const [pjmConstraintsRefreshToken, setPjmConstraintsRefreshToken] = useState(0);
  const [pjmWeatherRefreshToken, setPjmWeatherRefreshToken] = useState(0);
  const [positionsHomeRefreshToken, setPositionsHomeRefreshToken] = useState(0);
  const [navPositionsRefreshToken, setNavPositionsRefreshToken] = useState(0);
  const [rawIceBlotterRefreshToken, setRawIceBlotterRefreshToken] = useState(0);
  const [clearStreetTradesRefreshToken, setClearStreetTradesRefreshToken] = useState(0);
  const [iceSettlementsRefreshToken, setIceSettlementsRefreshToken] = useState(0);
  const [gasDailyPricesRefreshToken, setGasDailyPricesRefreshToken] = useState(0);
  const [genscapeNomsRefreshToken, setGenscapeNomsRefreshToken] = useState(0);
  const [criterionNomsRefreshToken, setCriterionNomsRefreshToken] = useState(0);
  const [pjmDaLmpsFreshnessOpen, setPjmDaLmpsFreshnessOpen] = useState(false);
  const [powerLmpAddersFreshnessOpen, setPowerLmpAddersFreshnessOpen] = useState(false);
  const [pjmPriceDurationFreshnessOpen, setPjmPriceDurationFreshnessOpen] = useState(false);
  const [pjmPriceDistributionsFreshnessOpen, setPjmPriceDistributionsFreshnessOpen] =
    useState(false);
  const [pjmGenerationFreshnessOpen, setPjmGenerationFreshnessOpen] = useState(false);
  const [eiaGenerationFreshnessOpen, setEiaGenerationFreshnessOpen] = useState(false);
  const [pjmTightnessLookbackFreshnessOpen, setPjmTightnessLookbackFreshnessOpen] =
    useState(false);
  const [pjmOpsSummaryFreshnessOpen, setPjmOpsSummaryFreshnessOpen] = useState(false);
  const [pjmTermBibleFreshnessOpen, setPjmTermBibleFreshnessOpen] = useState(false);
  const [pjmLoadGrowthFreshnessOpen, setPjmLoadGrowthFreshnessOpen] = useState(false);
  const [pjmForecastsFreshnessOpen, setPjmForecastsFreshnessOpen] = useState(false);
  const [pjmForecastReportsFreshnessOpen, setPjmForecastReportsFreshnessOpen] =
    useState(false);
  const [pjmOutagesFreshnessOpen, setPjmOutagesFreshnessOpen] = useState(false);
  const [pjmConstraintsFreshnessOpen, setPjmConstraintsFreshnessOpen] = useState(false);
  const [pjmWeatherFreshnessOpen, setPjmWeatherFreshnessOpen] = useState(false);
  const [positionsHomeFreshnessOpen, setPositionsHomeFreshnessOpen] = useState(false);
  const [navPositionsFreshnessOpen, setNavPositionsFreshnessOpen] = useState(false);
  const [rawIceBlotterFreshnessOpen, setRawIceBlotterFreshnessOpen] = useState(false);
  const [clearStreetTradesFreshnessOpen, setClearStreetTradesFreshnessOpen] =
    useState(false);
  const [iceSettlementsFreshnessOpen, setIceSettlementsFreshnessOpen] =
    useState(false);
  const [gasDailyPricesFreshnessOpen, setGasDailyPricesFreshnessOpen] =
    useState(false);
  const [genscapeNomsFreshnessOpen, setGenscapeNomsFreshnessOpen] =
    useState(false);
  const [criterionNomsFreshnessOpen, setCriterionNomsFreshnessOpen] =
    useState(false);
  const [pjmDaLmpsFreshness, setPjmDaLmpsFreshness] =
    useState<PjmDaLmpsFreshnessSummary>(DEFAULT_PJM_DA_LMPS_FRESHNESS);
  const [powerLmpAddersFreshness, setPowerLmpAddersFreshness] =
    useState<PowerLmpAddersFreshnessSummary>(DEFAULT_POWER_LMP_ADDERS_FRESHNESS);
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
  const [eiaGenerationFreshness, setEiaGenerationFreshness] =
    useState<EiaGenerationFreshnessSummary>(DEFAULT_EIA_GENERATION_FRESHNESS);
  const [pjmTightnessLookbackFreshness, setPjmTightnessLookbackFreshness] =
    useState<PjmTightnessLookbackFreshnessSummary>(
      DEFAULT_PJM_TIGHTNESS_LOOKBACK_FRESHNESS,
    );
  const [pjmOpsSummaryFreshness, setPjmOpsSummaryFreshness] =
    useState<PjmOpsSummaryFreshnessSummary>(DEFAULT_PJM_OPS_SUMMARY_FRESHNESS);
  const [pjmTermBibleFreshness, setPjmTermBibleFreshness] =
    useState<PjmTermBibleFreshnessSummary>(DEFAULT_PJM_TERM_BIBLE_FRESHNESS);
  const [pjmLoadGrowthFreshness, setPjmLoadGrowthFreshness] =
    useState<PjmLoadGrowthFreshnessSummary>(DEFAULT_PJM_LOAD_GROWTH_FRESHNESS);
  const [pjmForecastsFreshness, setPjmForecastsFreshness] =
    useState<PjmForecastsFreshnessSummary>(DEFAULT_PJM_FORECASTS_FRESHNESS);
  const [pjmForecastReportsFreshness, setPjmForecastReportsFreshness] =
    useState<PjmForecastReportsFreshnessSummary>(DEFAULT_PJM_FORECAST_REPORTS_FRESHNESS);
  const [pjmOutagesFreshness, setPjmOutagesFreshness] =
    useState<PjmOutagesFreshnessSummary>(DEFAULT_PJM_OUTAGES_FRESHNESS);
  const [pjmConstraintsFreshness, setPjmConstraintsFreshness] =
    useState<PjmConstraintsFreshnessSummary>(DEFAULT_PJM_CONSTRAINTS_FRESHNESS);
  const [pjmWeatherFreshness, setPjmWeatherFreshness] =
    useState<WeatherDashboardFreshnessSummary>(DEFAULT_PJM_WEATHER_FRESHNESS);
  const [positionsHomeFreshness, setPositionsHomeFreshness] =
    useState<PositionsHomeFreshnessSummary>(DEFAULT_POSITIONS_HOME_FRESHNESS);
  const [navPositionsFreshness, setNavPositionsFreshness] =
    useState<NavPositionsFreshnessSummary>(DEFAULT_NAV_POSITIONS_FRESHNESS);
  const [rawIceBlotterFreshness, setRawIceBlotterFreshness] =
    useState<RawIceTradeBlotterFreshnessSummary>(
      DEFAULT_RAW_ICE_BLOTTER_FRESHNESS,
    );
  const [clearStreetTradesFreshness, setClearStreetTradesFreshness] =
    useState<ClearStreetTradesFreshnessSummary>(
      DEFAULT_CLEAR_STREET_TRADES_FRESHNESS,
    );
  const [iceSettlementsFreshness, setIceSettlementsFreshness] =
    useState<IceTradeBlotterFreshnessSummary>(
      DEFAULT_ICE_SETTLEMENTS_FRESHNESS,
    );
  const [gasDailyPricesFreshness, setGasDailyPricesFreshness] =
    useState<GasDailyPricesFreshnessSummary>(
      DEFAULT_GAS_DAILY_PRICES_FRESHNESS,
    );
  const [genscapeNomsFreshness, setGenscapeNomsFreshness] =
    useState<GenscapeNomsFreshnessSummary>(DEFAULT_GENSCAPE_NOMS_FRESHNESS);
  const [criterionNomsFreshness, setCriterionNomsFreshness] =
    useState<CriterionNomsFreshnessSummary>(DEFAULT_CRITERION_NOMS_FRESHNESS);
  const initialPjmDaLmpDate = parseDateParam(searchParams.get("date"));
  const initialGtnBalanceDate = parseDateParam(searchParams.get("date"));
  const initialCriterionNomsDate = parseDateParam(searchParams.get("date"));
  const initialPjmDaLmpView = parsePjmLmpViewParam(searchParams.get("view"));
  const initialPjmDaLmpRtSource = parsePjmLmpRtSourceParam(
    searchParams.get("source") ?? searchParams.get("rtSource"),
  );
  const initialPjmDaLmpComponent = parsePjmLmpComponentParam(
    searchParams.get("component"),
  );
  const initialPjmDaLmpRefresh = parseRefreshParam(searchParams.get("refresh"));
  const initialForecastType = parseInitialForecastType(
    searchParams.get("forecastType") ?? searchParams.get("type"),
    searchParams.get("section"),
    showLocalDevFeatures,
  );
  const initialForecastSourceMode =
    parseForecastSourceModeParam(searchParams.get("forecastSource")) ??
    parseForecastSourceModeParam(searchParams.get("source")) ??
    "pjm";
  const initialForecastMode =
    parseForecastModeParam(searchParams.get("forecastMode")) ??
    parseForecastModeParam(searchParams.get("mode")) ??
    "outright";
  const initialForecastArea = parseTextParam(
    searchParams.get("forecastArea") ?? searchParams.get("area"),
  );
  const initialForecastDate = parseDateParam(
    searchParams.get("forecastDate") ?? searchParams.get("date"),
  );
  const initialNetLoadForecastComponent = parseNetLoadForecastComponentParam(
    searchParams.get("component"),
  );
  const initialNetLoadForecastStatistic = parseNetLoadForecastStatisticParam(
    searchParams.get("statistic"),
  );
  const initialGenscapeNomsStart = parseDateParam(searchParams.get("start"));
  const initialGenscapeNomsEnd = parseDateParam(searchParams.get("end"));
  const initialGenscapeNomsRoleIds = parseNumberCsvParam(
    searchParams.get("locationRoleId") ?? searchParams.get("roleIds"),
  );
  const initialGenscapeNomsPipeline = parseTextParam(searchParams.get("pipeline"));
  const initialGenscapeNomsSelectionName = parseTextParam(
    searchParams.get("selectionName") ?? searchParams.get("name"),
  );
  const initialGenscapeNomsSelectionSource = parseTextParam(
    searchParams.get("selectionSource"),
  );
  const routeSaltsTab = parseSaltsTabFromView(searchParams.get("view")) ?? "wx-adj-scrapes";
  const [saltsActiveTab, setSaltsActiveTab] = useState<SaltsTab>(routeSaltsTab);

  useEffect(() => {
    setActiveSection((current) => (current === routeSection ? current : routeSection));
  }, [routeSection]);

  useEffect(() => {
    if (routeSection !== "pjm-da-lmps") return;
    setLmpWorkspaceView((current) =>
      current === routeLmpWorkspaceView ? current : routeLmpWorkspaceView,
    );
  }, [routeLmpWorkspaceView, routeSection]);

  useEffect(() => {
    if (routeSection !== "pjm-da-lmps") return;
    setLmpWorkspaceIso((current) =>
      current === routeLmpWorkspaceIso ? current : routeLmpWorkspaceIso,
    );
  }, [routeLmpWorkspaceIso, routeSection]);

  useEffect(() => {
    if (routeSection !== "pjm-da-lmps") return;
    setLmpGasHub((current) =>
      current === routeLmpGasHub ? current : routeLmpGasHub,
    );
  }, [routeLmpGasHub, routeSection]);

  useEffect(() => {
    if (routeSection !== "pjm-da-lmps") return;
    setLmpSparkHeatRate((current) =>
      current === routeLmpSparkHeatRate ? current : routeLmpSparkHeatRate,
    );
  }, [routeLmpSparkHeatRate, routeSection]);

  useEffect(() => {
    if (activeSection !== "salts") return;
    const routedTab = parseSaltsTabFromView(searchParams.get("view"));
    setSaltsActiveTab(routedTab ?? "wx-adj-scrapes");
  }, [activeSection, searchParams]);

  useEffect(() => {
    if (!showLocalDevFeatures || searchParams.get("section") !== "pjm-net-load-forecast") return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("section", "pjm-forecasts");
    params.set("forecastType", "netLoad");
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [router, searchParams, showLocalDevFeatures]);

  const replaceRouteState = (section: ActiveSection) => {
    const params = new URLSearchParams(searchParams.toString());
    if (isBackOfficeSection(section) || section === "eia-generation") {
      params.set("view", section);
      params.delete("section");
    } else {
      params.set("section", section);
      params.delete("view");
    }
    params.delete("forecastView");
    router.replace(`/?${params.toString()}`, { scroll: false });
  };

  const replaceLmpWorkspaceRoute = (
    view: LmpWorkspaceView,
    iso: PjmLmpIso,
    gasHub: PjmHeatRateGasHubKey = lmpGasHub,
    sparkHeatRate: number = lmpSparkHeatRate,
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    const product = productForLmpWorkspaceView(view);
    const metricMode = metricModeForLmpWorkspaceView(view);
    params.set("section", "pjm-da-lmps");
    params.set("iso", iso);
    params.delete("forecastView");
    if (view === "adders") {
      params.set("view", "adders");
      params.delete("product");
      params.delete("source");
      params.delete("rtSource");
      params.delete("hub");
      params.delete("component");
      params.delete("metric");
      params.delete("gasHub");
      params.delete("sparkHeatRate");
    } else {
      if (params.get("view") === "adders" || (metricMode === "heat-rate" && params.get("view") === "compare-hubs")) {
        params.delete("view");
      }
      params.set("product", product);
      params.delete("dataset");
      if (metricMode === "spark-spread") {
        params.set("view", "daily-settles");
        params.set("component", "total");
        params.set("metric", "spark-spread");
        params.set("gasHub", gasHub);
        params.set("sparkHeatRate", sparkHeatRate.toFixed(1));
      } else if (metricMode === "heat-rate") {
        params.set("metric", "heat-rate");
        params.set("gasHub", gasHub);
        params.delete("sparkHeatRate");
      } else {
        params.delete("metric");
        params.delete("gasHub");
        params.delete("sparkHeatRate");
      }
    }
    router.replace(`/?${params.toString()}`, { scroll: false });
  };

  const handleSectionChange = (section: ActiveSection) => {
    if (section === "pjm-da-lmps") {
      setLmpWorkspaceView("da");
      setActiveSection(section);
      replaceLmpWorkspaceRoute("da", lmpWorkspaceIso);
      return;
    }
    setActiveSection(section);
    replaceRouteState(section);
  };

  const handleLmpWorkspaceViewChange = (view: LmpWorkspaceView) => {
    const nextIso =
      view === "adders" && !isLmpAdderIso(lmpWorkspaceIso)
        ? "pjm"
        : lmpWorkspaceIso;
    setLmpWorkspaceView(view);
    setLmpWorkspaceIso(nextIso);
    setActiveSection("pjm-da-lmps");
    replaceLmpWorkspaceRoute(view, nextIso);
  };

  const handleLmpWorkspaceIsoChange = (iso: PjmLmpIso) => {
    const nextView =
      lmpWorkspaceView === "adders" && !isLmpAdderIso(iso)
        ? "da"
        : lmpWorkspaceView;
    setLmpWorkspaceIso(iso);
    setLmpWorkspaceView(nextView);
    setActiveSection("pjm-da-lmps");
    replaceLmpWorkspaceRoute(nextView, iso);
  };

  const handlePjmLmpGasHubChange = (nextGasHub: PjmHeatRateGasHubKey) => {
    setLmpGasHub(nextGasHub);
    if (isLmpHeatRateWorkspaceView(lmpWorkspaceView) || isLmpSparkWorkspaceView(lmpWorkspaceView)) {
      replaceLmpWorkspaceRoute(lmpWorkspaceView, lmpWorkspaceIso, nextGasHub);
    }
  };

  const handlePjmLmpSparkHeatRateChange = (nextSparkHeatRate: number) => {
    setLmpSparkHeatRate(nextSparkHeatRate);
    if (isLmpSparkWorkspaceView(lmpWorkspaceView)) {
      replaceLmpWorkspaceRoute(lmpWorkspaceView, lmpWorkspaceIso, lmpGasHub, nextSparkHeatRate);
    }
  };

  const handleSaltsTabChange = (tab: SaltsTab) => {
    setSaltsActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", viewForSaltsTab(tab));
    params.delete("section");
    params.delete("forecastView");
    router.replace(`/?${params.toString()}`, { scroll: false });
  };

  const meta = useMemo(() => {
    if (activeSection === "power-settles-dashboard") {
      return {
        title: "Power Settles",
        subtitle:
          "Cross-ISO total LMP settles summary for DA, RT, and DART default hubs.",
        footer:
          "Power Settles | Sources: promoted PJM, ERCOT, ISO-NE, and CAISO LMP tables / Azure PostgreSQL",
      };
    }
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
    if (showLocalDevFeatures && activeSection === "positions-home") {
      return {
        title: "DEV / Old Positions Home",
        subtitle:
          "Expected source files, source stability, and reference repair status across positions and trades.",
        footer:
          "Positions Home | Sources: NAV SFTP, Clear Street SFTP, ICE Deal Report, and positions_and_trades_ref",
      };
    }
    if (activeSection === "backoffice-home") {
      return {
        title: "Home",
        subtitle:
          "Foundation health check for NAV and Clear Street source files versus latest DB-ingested files.",
        footer:
          "Sources: nav.positions, clear_street.eod_transactions, and ops.api_fetch_log telemetry; processed-file tables are not promoted locally",
      };
    }
    if (activeSection === "backoffice-positions-trades") {
      return {
        title: "Positions & Trades",
        subtitle:
          "Trader view of NAV position valuation with total-book and account-level exposure scanning.",
        footer: "Sources: nav.positions; Spark nav.position_valuation/nav.processed_files contracts are not promoted locally",
      };
    }
    if (activeSection === "backoffice-monitor") {
      return {
        title: "Monitor",
        subtitle: "Access allowlists and effective Back Office permissions by section.",
        footer: "Source: Vercel environment allowlists resolved by app middleware",
      };
    }
    if (activeSection === "backoffice-trade-pipeline") {
      return {
        title: "Trade Pipeline",
        subtitle:
          "Clean-slate control plane for the new Clear Street to MUFG queue, worker, and audit spine.",
        footer:
          "Sources: clear_street.eod_transactions and ops.api_fetch_log MUFG telemetry; download route is date-scoped to the selected Titan file",
      };
    }
    if (activeSection === "backoffice-nav-daily-position-sheet") {
      return {
        title: "NAV Daily Position Sheet",
        subtitle:
          "NAV-only daily gas and power position matrix with historical date selection and Excel export.",
        footer: "Sources: nav.positions; nav.riskmatrix/nav.processed_files are not promoted locally",
      };
    }
    if (activeSection === "ice-trade-blotter") {
      return {
        title: "Trade Blotter",
        subtitle:
          "Clear Street and ICE trade rows aggregated for visual trade inspection, with bounded row-level drilldowns.",
        footer:
          "Trade Blotter | Sources: clear_street.eod_transactions and ice_trade_blotter.ice_trade_blotter / Azure PostgreSQL",
      };
    }
    if (showLocalDevFeatures && activeSection === "nav-positions") {
      return {
        title: "DEV / Old NAV Positions",
        subtitle:
          "Position valuation snapshots aggregated by product, with drilldown rows and product-code rules.",
        footer: "NAV Positions | Source: nav.positions / Azure PostgreSQL",
      };
    }
    if (showLocalDevFeatures && activeSection === "clear-street-trades") {
      return {
        title: "DEV / Old Clear Street Trades",
        subtitle:
          "Clear Street MUFG trade review with product matching, aggregate signatures, and bounded raw-row drilldowns.",
        footer:
          "Clear Street Trades | Source: clear_street.eod_transactions / Azure PostgreSQL",
      };
    }
    if (activeSection === "ice-power-short-term") {
      return {
        title: "ICE Power Short Term",
        subtitle:
          "PJM daily, weekly, and weekend power settlement marks with source context.",
        footer:
          "ICE Power Short Term | Source: PJM LMPs + ice_python.settlements / Azure PostgreSQL",
      };
    }
    if (activeSection === "ice-power-term") {
      return {
        title: "ICE Power Term",
        subtitle:
          "Market-level monthly power futures matrices with contract detail history.",
        footer: "ICE Power Term | Source: ice_python.settlements / Azure PostgreSQL",
      };
    }
    if (activeSection === "spark-spreads") {
      return {
        title: "ICE Power Analytics",
        subtitle:
          "Outright, calendar, and spark spread curve history with heat-rate context.",
        footer: "ICE Power Analytics | Source: ice_python.settlements / Azure PostgreSQL",
      };
    }
    if (showLocalDevFeatures && activeSection === "map") {
      return {
        title: "RT",
        subtitle: "Real-time nominations map for pipelines, locations, and imported RT selections.",
        footer: "RT | Source: GenscapeDataFeed.natgas metadata / Azure SQL",
      };
    }
    if (showLocalDevFeatures && activeSection === "noms") {
      return {
        title: "Noms",
        subtitle: "Pipeline, location, and imported nominations from Genscape natgas data.",
        footer: "Noms | Source: GenscapeDataFeed.natgas nominations / Azure SQL",
      };
    }
    if (showLocalDevFeatures && activeSection === "criterion-noms") {
      return {
        title: "Criterion Noms",
        subtitle:
          "PJM-state power plant delivery nominations from Criterion Snowflake.",
        footer: "Criterion Noms | Source: Criterion Snowflake PRODUCTION.PIPELINES",
      };
    }
    if (showLocalDevFeatures && activeSection === "gtn-balance") {
      return {
        title: "GTN Balance",
        subtitle:
          "Date-addressable GTN pipeline balance from Criterion nominations with auditable point mappings.",
        footer: "GTN Balance | Source: Criterion Snowflake PRODUCTION.PIPELINES",
      };
    }
    if (activeSection === "gas-prices") {
      return {
        title: "ICE GAS Cash & Term",
        subtitle: "ICE gas cash, BalMo, and active monthly settlements by region and market.",
        footer: "ICE GAS Cash & Term | Source: ice_python.settlements / helios_prod",
      };
    }
    if (activeSection === "gas-outright") {
      return {
        title: "ICE Gas Analytics",
        subtitle: "ICE gas monthly outright and calendar-spread evolution by EIA region and market.",
        footer: "ICE Gas Analytics | Source: ice_python.settlements / helios_prod",
      };
    }
    if (showLocalDevFeatures && activeSection === "salts") {
      return saltsChromeForTab(saltsActiveTab);
    }
    if (activeSection === "eia-generation") {
      return {
        title: "EIA Generation Dashboard",
        subtitle:
          "EIA-930 daily generation by ISO - fuel mix, gas burns, coal-gas switching, and renewables displacement.",
        footer:
          "EIA Generation Dashboard | Sources: EIA-930 daily generation by fuel, daily region data, and WSI weather / Azure PostgreSQL",
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
    if (showLocalDevFeatures && activeSection === "pjm-da-model") {
      return {
        title: "PJM DA Model",
        subtitle:
          "Probabilistic PJM day-ahead LMP forecasts, model quality, analogs, and gas/load/outage context.",
        footer:
          "PJM DA Model | Sources: promoted PJM DA model SQL inputs / helios_prod readonly",
      };
    }
    if (showLocalDevFeatures && activeSection === "pjm-tightness-lookback") {
      return {
        title: "Tightness Lookback",
        subtitle:
          "PJM yesterday adequacy lookback using load, reserves, prices, constraints, interchange, generation, and outages.",
        footer:
          "Tightness Lookback | Source: PJM Data Miner operational feeds / Azure PostgreSQL",
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
    if (showLocalDevFeatures && activeSection === "pjm-forecast-reports") {
      return {
        title: "Forecast Reports",
        subtitle:
          "Compact PJM Data Miner morning load forecast change report by area and date, split into PK, OnPk, and OffPeak.",
        footer: "Forecast Reports | Source: pjm.load_frcstd_7_day / Azure PostgreSQL",
      };
    }
    if (activeSection === "pjm-outages") {
      return {
        title: "Outages",
        subtitle:
          "PJM generation outage forecast vintages and seasonal outage overlays. Transmission outage tickets now live under Constraints.",
        footer: "Outages | Source: PJM Data Miner / Azure PostgreSQL",
      };
    }
    if (activeSection === "pjm-constraints") {
      return {
        title: "Constraints",
        subtitle:
          "PJM RT and DA constraints by daily HE profile, with transmission outage tickets and RAW-model WHUB shift factors.",
        footer: "Constraints | Source: PJM Data Miner constraint feeds / Azure PostgreSQL",
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
        subtitle: "WSI hourly observed and forecast weather for PJM station coverage.",
        footer: "Weather | Source: WSI / Azure PostgreSQL",
      };
    }
    if (showLocalDevFeatures && activeSection === "wsi-weather") {
      return {
        title: "WSI Weather",
        subtitle:
          "Weighted degree-day forecast changes by WSI and model-run issue.",
        footer:
          "WSI Weather | Source: weather.wsi_daily_weighted_degree_day_forecasts / Azure PostgreSQL",
      };
    }
    if (showLocalDevFeatures && activeSection === "wsi-weather-report") {
      return {
        title: "WSI Report",
        subtitle:
          "Screen-first WSI weighted degree-day report with EIA week and day-bucket summaries.",
        footer:
          "WSI Report | Sources: WSI weighted degree-day forecasts, 10yr normals, and prior-year observations / Azure PostgreSQL",
      };
    }
    if (showLocalDevFeatures && activeSection === "weather-short-term") {
      return {
        title: "Short-Term Weather",
        subtitle:
          "Public-source radar, station observations, and short-term forecasts for storm timing.",
        footer:
          "Short-Term Weather | Sources: IEM NEXRAD, IEM ASOS/MADIS, NOAA/NWS, and NOAA MRMS reference",
      };
    }
    return {
      title: "Power LMPs",
      subtitle:
        "PJM, ERCOT, ISO-NE, CAISO, MISO, SPP, and NYISO power prices, with price adders and reserve metrics in the Adders tab.",
      footer: "Power LMPs | Source: Azure PostgreSQL and promoted reserve/adders tables",
    };
  }, [activeSection, saltsActiveTab, showLocalDevFeatures]);

  const isHistoricalSettlements = activeSection === "pjm-historical-settlements";
  const isIcePowerPage =
    activeSection === "ice-power-short-term" || activeSection === "ice-power-term";
  const isNavDailyPositionSheet = activeSection === "backoffice-nav-daily-position-sheet";
  const isSaltModelSection = showLocalDevFeatures && activeSection === "salts";
  const isPjmDaModelSection = showLocalDevFeatures && activeSection === "pjm-da-model";
  const isEiaGenerationSection = activeSection === "eia-generation";
  const isCenteredWorkstation =
    isHistoricalSettlements ||
    activeSection === "spark-spreads" ||
    activeSection === "gas-outright";
  const usesPowerMarketEyebrow =
    activeSection === "power-settles-dashboard" ||
    activeSection === "pjm-da-lmps" ||
    (showLocalDevFeatures && activeSection === "pjm-forecast-reports") ||
    isPjmDaModelSection ||
    isEiaGenerationSection ||
    isHistoricalSettlements ||
    isIcePowerPage ||
    activeSection === "pjm-constraints";
  const usesGasMarketEyebrow =
    activeSection === "gas-prices" ||
    activeSection === "gas-outright" ||
    isSaltModelSection;
  const usesBackOfficeEyebrow = isBackOfficeSection(activeSection);
  const isGtnResearchViewerReplica =
    showLocalDevFeatures && activeSection === "gtn-balance";
  const activeLmpAdderIso: LmpAdderIso = isLmpAdderIso(lmpWorkspaceIso)
    ? lmpWorkspaceIso
    : "pjm";
  const activeLmpProduct = productForLmpWorkspaceView(lmpWorkspaceView);
  const activeLmpMetricMode = metricModeForLmpWorkspaceView(lmpWorkspaceView);
  const initialLmpViewForWorkspace = isLmpSparkWorkspaceView(lmpWorkspaceView)
    ? "daily-settles"
    : initialPjmDaLmpView;

  return (
    <div className="flex min-h-screen flex-col bg-[#0f1117] text-gray-100 md:flex-row">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        showLocalDevFeatures={showLocalDevFeatures}
      />

      <div className="min-w-0 flex-1 overflow-auto">
        <main
          className={
            isGtnResearchViewerReplica
              ? "h-screen w-full overflow-hidden bg-white p-0"
              : isNavDailyPositionSheet
              ? "w-full max-w-none px-5 py-8 sm:px-12"
              : isEiaGenerationSection
              ? "mx-auto w-full max-w-[1700px] px-4 py-8 sm:px-8"
              : isSaltModelSection
              ? "w-full max-w-none px-4 py-8 sm:px-8"
              : `w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8 ${
                  isCenteredWorkstation ? "mx-auto max-w-full md:max-w-7xl" : ""
                }`
          }
        >
          {!isGtnResearchViewerReplica && (
          <div className="mb-6 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-start md:justify-between md:gap-6">
            <div className="min-w-0 max-w-full">
              <p className="mb-1 hidden text-xs font-semibold uppercase tracking-widest text-gray-500 md:block">
                {usesBackOfficeEyebrow
                  ? "Helios CTA | Back Office"
                  : isPjmDaModelSection
                    ? "Helios CTA | Power / PJM"
                    : usesPowerMarketEyebrow
                    ? "Helios CTA | Power Markets"
                    : usesGasMarketEyebrow
                      ? "Helios CTA | Gas Markets"
                      : "HeliosCTA"}
              </p>
              <h1
                className={
                  isSaltModelSection
                    ? "text-2xl font-bold text-gray-100 sm:text-3xl"
                    : "text-xl font-bold text-gray-100 sm:text-3xl"
                }
              >
                {meta.title}
              </h1>
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
              {activeSection === "pjm-da-lmps" && (
                <p className="mt-1 text-xs font-medium text-sky-300">
                  Adders & Reserves covers PJM reserve and ancillary metrics plus ERCOT RT price adders.
                </p>
              )}
              {isSaltModelSection && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {saltsChromeForTab(saltsActiveTab).badges.map((badge) => (
                    <span
                      key={`${badge.label}:${badge.value}`}
                      className="inline-flex items-center gap-1 rounded-md bg-gray-800 px-2.5 py-1 text-xs text-gray-400"
                    >
                      <span className="text-gray-600">{badge.label}</span>
                      <span className="text-gray-300">{badge.value}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {activeSection === "pjm-da-lmps" && lmpWorkspaceView !== "adders" && (
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

            {activeSection === "pjm-da-lmps" && lmpWorkspaceView === "adders" && (
              <FreshnessCard
                statusLabel={powerLmpAddersFreshness.status}
                statusClass={powerLmpAddersFreshness.statusClass}
                summary={powerLmpAddersFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: powerLmpAddersFreshness.status,
                    className: powerLmpAddersFreshness.statusClass,
                  },
                  { label: "Selected Day", value: powerLmpAddersFreshness.targetDateLabel },
                  { label: "Latest Day", value: powerLmpAddersFreshness.latestDateLabel },
                  { label: "Source Update", value: powerLmpAddersFreshness.latestUpdateLabel },
                ]}
                open={powerLmpAddersFreshnessOpen}
                onToggle={() => setPowerLmpAddersFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPowerLmpAddersRefreshToken((value) => value + 1)}
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

            {activeSection === "pjm-constraints" && (
              <FreshnessCard
                statusLabel={pjmConstraintsFreshness.status}
                statusClass={pjmConstraintsFreshness.statusClass}
                summary={pjmConstraintsFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: pjmConstraintsFreshness.status,
                    className: pjmConstraintsFreshness.statusClass,
                  },
                  { label: "Selection", value: pjmConstraintsFreshness.targetDateLabel },
                  { label: "Latest Date", value: pjmConstraintsFreshness.latestDateLabel },
                  { label: "Source Update", value: pjmConstraintsFreshness.latestUpdateLabel },
                ]}
                open={pjmConstraintsFreshnessOpen}
                onToggle={() => setPjmConstraintsFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPjmConstraintsRefreshToken((value) => value + 1)}
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

            {showLocalDevFeatures && activeSection === "positions-home" && (
              <FreshnessCard
                statusLabel={positionsHomeFreshness.status}
                statusClass={positionsHomeFreshness.statusClass}
                summary={positionsHomeFreshness.summary}
                items={[
                  ...(positionsHomeFreshness.status === "Stable"
                    ? []
                    : [
                        {
                          label: "Health Status",
                          value: positionsHomeFreshness.status,
                          className: positionsHomeFreshness.statusClass,
                        },
                      ]),
                  { label: "Review Date", value: positionsHomeFreshness.targetDateLabel },
                  { label: "Feeds", value: positionsHomeFreshness.latestDateLabel },
                  { label: "Generated", value: positionsHomeFreshness.latestUpdateLabel },
                ]}
                open={positionsHomeFreshnessOpen}
                onToggle={() => setPositionsHomeFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPositionsHomeRefreshToken((value) => value + 1)}
                showStatusBadge={positionsHomeFreshness.status !== "Stable"}
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

            {activeSection === "ice-trade-blotter" && (
              <FreshnessCard
                statusLabel={rawIceBlotterFreshness.status}
                statusClass={rawIceBlotterFreshness.statusClass}
                summary={rawIceBlotterFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: rawIceBlotterFreshness.status,
                    className: rawIceBlotterFreshness.statusClass,
                  },
                  { label: "Selected Date", value: rawIceBlotterFreshness.targetDateLabel },
                  { label: "Latest Date", value: rawIceBlotterFreshness.latestDateLabel },
                  { label: "Latest Load", value: rawIceBlotterFreshness.latestUpdateLabel },
                  { label: "Rows", value: rawIceBlotterFreshness.rowCountLabel },
                ]}
                open={rawIceBlotterFreshnessOpen}
                onToggle={() => setRawIceBlotterFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setRawIceBlotterRefreshToken((value) => value + 1)}
              />
            )}

            {showLocalDevFeatures && activeSection === "clear-street-trades" && (
              <FreshnessCard
                statusLabel={clearStreetTradesFreshness.status}
                statusClass={clearStreetTradesFreshness.statusClass}
                summary={clearStreetTradesFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: clearStreetTradesFreshness.status,
                    className: clearStreetTradesFreshness.statusClass,
                  },
                  { label: "Selection", value: clearStreetTradesFreshness.targetDateLabel },
                  { label: "Latest SFTP Date", value: clearStreetTradesFreshness.latestDateLabel },
                  { label: "Latest Upload", value: clearStreetTradesFreshness.latestUpdateLabel },
                ]}
                open={clearStreetTradesFreshnessOpen}
                onToggle={() => setClearStreetTradesFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setClearStreetTradesRefreshToken((value) => value + 1)}
              />
            )}

            {activeSection === "ice-power-short-term" && (
              <FreshnessCard
                statusLabel={iceSettlementsFreshness.status}
                statusClass={iceSettlementsFreshness.statusClass}
                summary={iceSettlementsFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: iceSettlementsFreshness.status,
                    className: iceSettlementsFreshness.statusClass,
                  },
                  { label: "Selection", value: iceSettlementsFreshness.targetDateLabel },
                  { label: "Latest Date", value: iceSettlementsFreshness.latestDateLabel },
                  { label: "Source Update", value: iceSettlementsFreshness.latestUpdateLabel },
                  { label: "Rows", value: iceSettlementsFreshness.rowCountLabel },
                ]}
                open={iceSettlementsFreshnessOpen}
                onToggle={() => setIceSettlementsFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setIceSettlementsRefreshToken((value) => value + 1)}
              />
            )}

            {activeSection === "gas-prices" && (
              <FreshnessCard
                statusLabel={gasDailyPricesFreshness.status}
                statusClass={gasDailyPricesFreshness.statusClass}
                summary={gasDailyPricesFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: gasDailyPricesFreshness.status,
                    className: gasDailyPricesFreshness.statusClass,
                  },
                  { label: "Latest Trade", value: gasDailyPricesFreshness.latestDateLabel },
                  { label: "Fields", value: gasDailyPricesFreshness.fieldLabel },
                  { label: "Data As Of", value: gasDailyPricesFreshness.latestUpdateLabel },
                  { label: "Markets", value: gasDailyPricesFreshness.rowCountLabel },
                ]}
                open={gasDailyPricesFreshnessOpen}
                onToggle={() => setGasDailyPricesFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setGasDailyPricesRefreshToken((value) => value + 1)}
              />
            )}

            {showLocalDevFeatures && activeSection === "noms" && (
              <FreshnessCard
                statusLabel={genscapeNomsFreshness.status}
                statusClass={genscapeNomsFreshness.statusClass}
                summary={`Gas day ${genscapeNomsFreshness.latestGasDayLabel}`}
                items={[
                  {
                    label: "Freshness Status",
                    value: genscapeNomsFreshness.status,
                    className: genscapeNomsFreshness.statusClass,
                  },
                  { label: "Latest Gas Day", value: genscapeNomsFreshness.latestGasDayLabel },
                  { label: "Source Update", value: genscapeNomsFreshness.latestUpdateLabel },
                ]}
                open={genscapeNomsFreshnessOpen}
                onToggle={() => setGenscapeNomsFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setGenscapeNomsRefreshToken((value) => value + 1)}
              />
            )}

            {showLocalDevFeatures && activeSection === "criterion-noms" && (
              <FreshnessCard
                statusLabel={criterionNomsFreshness.status}
                statusClass={criterionNomsFreshness.statusClass}
                summary={criterionNomsFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: criterionNomsFreshness.status,
                    className: criterionNomsFreshness.statusClass,
                  },
                  { label: "Report Date", value: criterionNomsFreshness.targetDateLabel },
                  { label: "Source Update", value: criterionNomsFreshness.latestUpdateLabel },
                  { label: "Rows", value: criterionNomsFreshness.rowCountLabel },
                  { label: "Scope", value: criterionNomsFreshness.scopeLabel },
                ]}
                open={criterionNomsFreshnessOpen}
                onToggle={() => setCriterionNomsFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setCriterionNomsRefreshToken((value) => value + 1)}
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

            {activeSection === "eia-generation" && (
              <FreshnessCard
                statusLabel={eiaGenerationFreshness.status}
                statusClass={eiaGenerationFreshness.statusClass}
                summary={eiaGenerationFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: eiaGenerationFreshness.status,
                    className: eiaGenerationFreshness.statusClass,
                  },
                  { label: "Region", value: eiaGenerationFreshness.targetDateLabel },
                  { label: "Latest EIA Day", value: eiaGenerationFreshness.latestDateLabel },
                  { label: "Source Update", value: eiaGenerationFreshness.latestUpdateLabel },
                ]}
                open={eiaGenerationFreshnessOpen}
                onToggle={() => setEiaGenerationFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setEiaGenerationRefreshToken((value) => value + 1)}
              />
            )}

            {showLocalDevFeatures && activeSection === "pjm-tightness-lookback" && (
              <FreshnessCard
                statusLabel={pjmTightnessLookbackFreshness.status}
                statusClass={pjmTightnessLookbackFreshness.statusClass}
                summary={pjmTightnessLookbackFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: pjmTightnessLookbackFreshness.status,
                    className: pjmTightnessLookbackFreshness.statusClass,
                  },
                  { label: "Selected Day", value: pjmTightnessLookbackFreshness.targetDateLabel },
                  { label: "Latest Day", value: pjmTightnessLookbackFreshness.latestDateLabel },
                  { label: "Source Update", value: pjmTightnessLookbackFreshness.latestUpdateLabel },
                ]}
                open={pjmTightnessLookbackFreshnessOpen}
                onToggle={() => setPjmTightnessLookbackFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPjmTightnessLookbackRefreshToken((value) => value + 1)}
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

            {showLocalDevFeatures && activeSection === "pjm-forecast-reports" && (
              <FreshnessCard
                statusLabel={pjmForecastReportsFreshness.status}
                statusClass={pjmForecastReportsFreshness.statusClass}
                summary={pjmForecastReportsFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: pjmForecastReportsFreshness.status,
                    className: pjmForecastReportsFreshness.statusClass,
                  },
                  { label: "Report Areas", value: pjmForecastReportsFreshness.targetDateLabel },
                  { label: "Latest Forecast Day", value: pjmForecastReportsFreshness.latestDateLabel },
                  { label: "Source Update", value: pjmForecastReportsFreshness.latestUpdateLabel },
                ]}
                open={pjmForecastReportsFreshnessOpen}
                onToggle={() => setPjmForecastReportsFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPjmForecastReportsRefreshToken((value) => value + 1)}
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
          )}

          {activeSection === "pjm-da-lmps" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-800 bg-[#12141d] p-2 shadow-xl shadow-black/20">
                <div className="border-b border-gray-800 pb-2">
                  <DashboardTabs
                    tabs={LMP_ISO_TABS}
                    activeValue={lmpWorkspaceIso}
                    onChange={handleLmpWorkspaceIsoChange}
                    ariaLabel="Power ISO"
                  />
                </div>
                <DashboardTabs
                  tabs={LMP_WORKSPACE_TABS}
                  activeValue={lmpWorkspaceView}
                  onChange={handleLmpWorkspaceViewChange}
                  ariaLabel="LMP products and adders"
                  variant="secondary"
                  className="pt-2"
                />
              </div>
              {lmpWorkspaceView !== "adders" ? (
                <PjmDaLmps
                  key={`lmp-prices-${lmpWorkspaceIso}-${lmpWorkspaceView}`}
                  initialIso={lmpWorkspaceIso}
                  initialDate={initialPjmDaLmpDate}
                  initialView={initialLmpViewForWorkspace}
                  initialProduct={activeLmpProduct}
                  initialRtSource={initialPjmDaLmpRtSource}
                  initialHub={initialPjmDaLmpHub}
                  initialComponent={initialPjmDaLmpComponent}
                  initialGasHub={routeLmpGasHubParam ? lmpGasHub : null}
                  initialGasHubExplicit={routeLmpGasHubParam !== null}
                  metricMode={activeLmpMetricMode}
                  gasHub={lmpGasHub}
                  sparkHeatRate={lmpSparkHeatRate}
                  showIsoTabs={false}
                  showProductTabs={false}
                  refreshToken={pjmDaLmpsRefreshToken + (initialPjmDaLmpRefresh ? 1 : 0)}
                  onProductChange={handleLmpWorkspaceViewChange}
                  onGasHubChange={handlePjmLmpGasHubChange}
                  onSparkHeatRateChange={handlePjmLmpSparkHeatRateChange}
                  onFreshnessChange={setPjmDaLmpsFreshness}
                />
              ) : (
                <PowerLmpAdders
                  key={`lmp-adders-${activeLmpAdderIso}`}
                  initialIso={activeLmpAdderIso}
                  showIsoTabs={false}
                  refreshToken={powerLmpAddersRefreshToken}
                  onFreshnessChange={setPowerLmpAddersFreshness}
                  routeSection="pjm-da-lmps"
                  routeView="adders"
                />
              )}
            </div>
          )}
          {activeSection === "power-settles-dashboard" && (
            <PowerSettlesDashboard />
          )}
          {isPjmDaModelSection && (
            <PjmDaMeteoBaselinePrice />
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
          {showLocalDevFeatures && activeSection === "positions-home" && (
            <PositionsHome
              refreshToken={positionsHomeRefreshToken}
              onFreshnessChange={setPositionsHomeFreshness}
            />
          )}
          {activeSection === "backoffice-home" && (
            <BackOfficeHome />
          )}
          {activeSection === "backoffice-positions-trades" && (
            <BackOfficePositionsTrades />
          )}
          {activeSection === "backoffice-monitor" && (
            <BackOfficeMonitor />
          )}
          {activeSection === "backoffice-trade-pipeline" && (
            <BackOfficeTradePipeline />
          )}
          {activeSection === "backoffice-nav-daily-position-sheet" && (
            <BackOfficeNavDailyPositionSheet />
          )}
          {showLocalDevFeatures && activeSection === "nav-positions" && (
            <NavPositions
              refreshToken={navPositionsRefreshToken}
              onFreshnessChange={setNavPositionsFreshness}
            />
          )}
          {activeSection === "ice-trade-blotter" && (
            <RawIceTradeBlotter
              refreshToken={rawIceBlotterRefreshToken}
              onFreshnessChange={setRawIceBlotterFreshness}
            />
          )}
          {showLocalDevFeatures && activeSection === "clear-street-trades" && (
            <ClearStreetTrades
              refreshToken={clearStreetTradesRefreshToken}
              onFreshnessChange={setClearStreetTradesFreshness}
            />
          )}
          {activeSection === "ice-power-short-term" && (
            <IceTradeBlotter
              refreshToken={iceSettlementsRefreshToken}
              onFreshnessChange={setIceSettlementsFreshness}
            />
          )}
          {activeSection === "spark-spreads" && (
            <SparkSpreadEvolution />
          )}
          {showLocalDevFeatures && activeSection === "map" && (
            <GenscapeMapExplorer />
          )}
          {showLocalDevFeatures && activeSection === "noms" && (
            <GenscapeNomsDashboard
              initialStartDate={initialGenscapeNomsStart}
              initialEndDate={initialGenscapeNomsEnd}
              initialLocationRoleIds={initialGenscapeNomsRoleIds}
              initialPipeline={initialGenscapeNomsPipeline}
              initialSelectionName={initialGenscapeNomsSelectionName}
              initialSelectionSource={initialGenscapeNomsSelectionSource}
              refreshToken={genscapeNomsRefreshToken}
              onFreshnessChange={setGenscapeNomsFreshness}
            />
          )}
          {showLocalDevFeatures && activeSection === "criterion-noms" && (
            <CriterionNomsDashboard
              initialDate={initialCriterionNomsDate}
              refreshToken={criterionNomsRefreshToken}
              onFreshnessChange={setCriterionNomsFreshness}
            />
          )}
          {showLocalDevFeatures && activeSection === "gtn-balance" && (
            <GtnPipelineBalance initialDate={initialGtnBalanceDate} />
          )}
          {activeSection === "ice-power-term" && (
            <IcePowerTermPage />
          )}
          {activeSection === "gas-prices" && (
            <GasDailyPrices
              refreshToken={gasDailyPricesRefreshToken}
              onFreshnessChange={setGasDailyPricesFreshness}
            />
          )}
          {activeSection === "gas-outright" && (
            <GasCurveEvolution />
          )}
          {showLocalDevFeatures && activeSection === "salts" && (
            <SaltsDashboard
              activeTab={saltsActiveTab}
              initialTab={saltsActiveTab}
              onTabChange={handleSaltsTabChange}
            />
          )}
          {showLocalDevFeatures && activeSection === "pjm-generation" && (
            <PjmGeneration
              refreshToken={pjmGenerationRefreshToken}
              onFreshnessChange={setPjmGenerationFreshness}
            />
          )}
          {activeSection === "eia-generation" && (
            <EiaGenerationDashboard
              refreshToken={eiaGenerationRefreshToken}
              onFreshnessChange={setEiaGenerationFreshness}
            />
          )}
          {showLocalDevFeatures && activeSection === "pjm-tightness-lookback" && (
            <PjmTightnessLookback
              refreshToken={pjmTightnessLookbackRefreshToken}
              onFreshnessChange={setPjmTightnessLookbackFreshness}
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
              initialMode={initialForecastMode}
              initialSourceMode={initialForecastSourceMode}
              initialArea={initialForecastArea}
              initialDate={initialForecastDate}
              initialNetLoadComponent={initialNetLoadForecastComponent}
              initialNetLoadStatistic={initialNetLoadForecastStatistic}
              refreshToken={pjmForecastsRefreshToken}
              onFreshnessChange={setPjmForecastsFreshness}
            />
          )}
          {showLocalDevFeatures && activeSection === "pjm-forecast-reports" && (
            <PjmForecastReports
              refreshToken={pjmForecastReportsRefreshToken}
              onFreshnessChange={setPjmForecastReportsFreshness}
            />
          )}
          {activeSection === "pjm-outages" && (
            <PjmOutages
              refreshToken={pjmOutagesRefreshToken}
              onFreshnessChange={setPjmOutagesFreshness}
            />
          )}
          {activeSection === "pjm-constraints" && (
            <PjmConstraints
              refreshToken={pjmConstraintsRefreshToken}
              onFreshnessChange={setPjmConstraintsFreshness}
            />
          )}
          {activeSection === "pjm-weather" && (
            <WeatherDashboard
              refreshToken={pjmWeatherRefreshToken}
              onFreshnessChange={setPjmWeatherFreshness}
            />
          )}
          {showLocalDevFeatures && activeSection === "wsi-weather" && (
            <WsiWeatherDashboard />
          )}
          {showLocalDevFeatures && activeSection === "wsi-weather-report" && (
            <WsiWeatherReportDashboard />
          )}
          {showLocalDevFeatures && activeSection === "weather-short-term" && (
            <ShortTermWeatherDashboard />
          )}
          {!isGtnResearchViewerReplica && (
            <p className="mt-6 text-center text-xs text-gray-600">{meta.footer}</p>
          )}
        </main>
      </div>
    </div>
  );
}
