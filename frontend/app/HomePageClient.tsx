"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import FreshnessCard from "@/components/dashboard/FreshnessCard";
import ClearStreetTrades, {
  type ClearStreetTradesFreshnessSummary,
} from "@/components/clear-street/ClearStreetTrades";
import GasDailyPrices from "@/components/gas/GasDailyPrices";
import GenscapeMapExplorer from "@/components/gas/GenscapeMapExplorer";
import GenscapeNomsDashboard from "@/components/gas/GenscapeNomsDashboard";
import type { GenscapeNomsFreshnessSummary } from "@/components/gas/GenscapeNomsReport";
import IcePmiCurveTable from "@/components/ice/IcePmiCurveTable";
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
import PjmPriceView from "@/components/pjm/PjmPriceView";
import PjmDaLmps, {
  type ComponentSelection as PjmLmpComponentSelection,
  type LmpProduct as PjmLmpProduct,
  type LmpView as PjmLmpView,
  type PjmDaLmpsFreshnessSummary,
  type PowerIso as PjmLmpIso,
  type RtLmpSource as PjmLmpRtSource,
} from "@/components/pjm/PjmDaLmps";
import PowerLmpAdders, {
  type PowerLmpAddersFreshnessSummary,
} from "@/components/pjm/PowerLmpAdders";
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
import Sidebar, { type ActiveSection } from "@/components/Sidebar";
import SparkSpreadEvolution from "@/components/spark/SparkSpreadEvolution";

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
  summary: "ICE Trade Blotter --",
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

const DEFAULT_GENSCAPE_NOMS_FRESHNESS: GenscapeNomsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  latestGasDayLabel: "--",
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
  if (value === "power-lmp-adders") return "power-lmp-adders";
  if (showLocalDevFeatures && value === "pjm-price-duration-curves") {
    return "pjm-price-duration-curves";
  }
  if (value === "positions-home") {
    return "positions-home";
  }
  if (value === "nav-positions") {
    return "nav-positions";
  }
  if (value === "ice-trade-blotter") {
    return "ice-trade-blotter";
  }
  if (showLocalDevFeatures && value === "clear-street-trades") {
    return "clear-street-trades";
  }
  if (value === "ice-settlements") {
    return "ice-settlements";
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
  if (showLocalDevFeatures && value === "ice-pmi-curve") {
    return "ice-pmi-curve";
  }
  if (showLocalDevFeatures && value === "gas-prices") {
    return "gas-prices";
  }
  if (showLocalDevFeatures && value === "pjm-generation") {
    return "pjm-generation";
  }
  if (showLocalDevFeatures && value === "pjm-tightness-lookback") {
    return "pjm-tightness-lookback";
  }
  if (showLocalDevFeatures && value === "pjm-net-load-forecast") {
    return "pjm-forecasts";
  }
  if (showLocalDevFeatures && value === "pjm-weather") return "pjm-weather";
  if (showLocalDevFeatures && value === "pjm-da-model") return "pjm-da-model";
  if (showLocalDevFeatures && value === "pjm-price-view") return "pjm-price-view";
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
  return "ice-settlements";
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

function parsePjmLmpIsoParam(value: string | null): PjmLmpIso | undefined {
  return value === "pjm" || value === "ercot" || value === "isone" || value === "caiso"
    ? value
    : undefined;
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
  const [activeSection, setActiveSection] = useState<ActiveSection>(
    parseInitialSection(searchParams.get("section"), showLocalDevFeatures),
  );
  const [pjmDaLmpsRefreshToken, setPjmDaLmpsRefreshToken] = useState(0);
  const [powerLmpAddersRefreshToken, setPowerLmpAddersRefreshToken] = useState(0);
  const [pjmDaModelRefreshToken, setPjmDaModelRefreshToken] = useState(0);
  const [pjmPriceDurationRefreshToken, setPjmPriceDurationRefreshToken] = useState(0);
  const [pjmPriceDistributionsRefreshToken, setPjmPriceDistributionsRefreshToken] =
    useState(0);
  const [pjmGenerationRefreshToken, setPjmGenerationRefreshToken] = useState(0);
  const [pjmTightnessLookbackRefreshToken, setPjmTightnessLookbackRefreshToken] =
    useState(0);
  const [pjmOpsSummaryRefreshToken, setPjmOpsSummaryRefreshToken] = useState(0);
  const [pjmTermBibleRefreshToken, setPjmTermBibleRefreshToken] = useState(0);
  const [pjmLoadGrowthRefreshToken, setPjmLoadGrowthRefreshToken] = useState(0);
  const [pjmForecastsRefreshToken, setPjmForecastsRefreshToken] = useState(0);
  const [pjmOutagesRefreshToken, setPjmOutagesRefreshToken] = useState(0);
  const [pjmWeatherRefreshToken, setPjmWeatherRefreshToken] = useState(0);
  const [positionsHomeRefreshToken, setPositionsHomeRefreshToken] = useState(0);
  const [navPositionsRefreshToken, setNavPositionsRefreshToken] = useState(0);
  const [rawIceBlotterRefreshToken, setRawIceBlotterRefreshToken] = useState(0);
  const [clearStreetTradesRefreshToken, setClearStreetTradesRefreshToken] = useState(0);
  const [iceSettlementsRefreshToken, setIceSettlementsRefreshToken] = useState(0);
  const [genscapeNomsRefreshToken, setGenscapeNomsRefreshToken] = useState(0);
  const [pjmDaLmpsFreshnessOpen, setPjmDaLmpsFreshnessOpen] = useState(false);
  const [powerLmpAddersFreshnessOpen, setPowerLmpAddersFreshnessOpen] = useState(false);
  const [pjmDaModelFreshnessOpen, setPjmDaModelFreshnessOpen] = useState(false);
  const [pjmPriceDurationFreshnessOpen, setPjmPriceDurationFreshnessOpen] = useState(false);
  const [pjmPriceDistributionsFreshnessOpen, setPjmPriceDistributionsFreshnessOpen] =
    useState(false);
  const [pjmGenerationFreshnessOpen, setPjmGenerationFreshnessOpen] = useState(false);
  const [pjmTightnessLookbackFreshnessOpen, setPjmTightnessLookbackFreshnessOpen] =
    useState(false);
  const [pjmOpsSummaryFreshnessOpen, setPjmOpsSummaryFreshnessOpen] = useState(false);
  const [pjmTermBibleFreshnessOpen, setPjmTermBibleFreshnessOpen] = useState(false);
  const [pjmLoadGrowthFreshnessOpen, setPjmLoadGrowthFreshnessOpen] = useState(false);
  const [pjmForecastsFreshnessOpen, setPjmForecastsFreshnessOpen] = useState(false);
  const [pjmOutagesFreshnessOpen, setPjmOutagesFreshnessOpen] = useState(false);
  const [pjmWeatherFreshnessOpen, setPjmWeatherFreshnessOpen] = useState(false);
  const [positionsHomeFreshnessOpen, setPositionsHomeFreshnessOpen] = useState(false);
  const [navPositionsFreshnessOpen, setNavPositionsFreshnessOpen] = useState(false);
  const [rawIceBlotterFreshnessOpen, setRawIceBlotterFreshnessOpen] = useState(false);
  const [clearStreetTradesFreshnessOpen, setClearStreetTradesFreshnessOpen] =
    useState(false);
  const [iceSettlementsFreshnessOpen, setIceSettlementsFreshnessOpen] =
    useState(false);
  const [genscapeNomsFreshnessOpen, setGenscapeNomsFreshnessOpen] =
    useState(false);
  const [pjmDaLmpsFreshness, setPjmDaLmpsFreshness] =
    useState<PjmDaLmpsFreshnessSummary>(DEFAULT_PJM_DA_LMPS_FRESHNESS);
  const [powerLmpAddersFreshness, setPowerLmpAddersFreshness] =
    useState<PowerLmpAddersFreshnessSummary>(DEFAULT_POWER_LMP_ADDERS_FRESHNESS);
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
  const [pjmOutagesFreshness, setPjmOutagesFreshness] =
    useState<PjmOutagesFreshnessSummary>(DEFAULT_PJM_OUTAGES_FRESHNESS);
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
  const [genscapeNomsFreshness, setGenscapeNomsFreshness] =
    useState<GenscapeNomsFreshnessSummary>(DEFAULT_GENSCAPE_NOMS_FRESHNESS);

  const initialPjmDaLmpDate = parseDateParam(searchParams.get("date"));
  const initialPjmDaLmpIso = parsePjmLmpIsoParam(searchParams.get("iso"));
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
    if (activeSection === "positions-home") {
      return {
        title: "Positions Home",
        subtitle:
          "Expected source files, source stability, and reference repair status across positions and trades.",
        footer:
          "Positions Home | Sources: NAV SFTP, Clear Street SFTP, ICE Deal Report, and positions_and_trades_ref",
      };
    }
    if (activeSection === "nav-positions") {
      return {
        title: "NAV Positions",
        subtitle:
          "Position valuation snapshots aggregated by product, with drilldown rows and product-code rules.",
        footer: "NAV Positions | Source: nav.positions / Azure PostgreSQL",
      };
    }
    if (activeSection === "ice-trade-blotter") {
      return {
        title: "ICE Trade Blotter",
        subtitle:
          "Raw ICE Deal Report rows aggregated for visual trade inspection, with bounded row-level drilldowns.",
        footer:
          "ICE Trade Blotter | Source: ice_trade_blotter.ice_trade_blotter / Azure PostgreSQL",
      };
    }
    if (showLocalDevFeatures && activeSection === "clear-street-trades") {
      return {
        title: "Clear Street Trades",
        subtitle:
          "Local DEV Clear Street MUFG trades derived with frontend JSON and TypeScript product rules.",
        footer:
          "Clear Street Trades | Source: clear_street.eod_transactions / JSON + TypeScript rules",
      };
    }
    if (activeSection === "ice-settlements") {
      return {
        title: "Power ICE Settles",
        subtitle:
          "PJM short-term and monthly power settlement marks with source context.",
        footer:
          "Power ICE Settles | Source: PJM LMPs + ice_python.settlements / Azure PostgreSQL",
      };
    }
    if (activeSection === "spark-spreads") {
      return {
        title: "Power Sparks",
        subtitle:
          "Outright, calendar, and spark spread curve history with heat-rate context.",
        footer: "Power Sparks | Source: ice_python.settlements / Azure PostgreSQL",
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
    if (showLocalDevFeatures && activeSection === "ice-pmi-curve") {
      return {
        title: "ICE PMI",
        subtitle:
          "PMI monthly curve table with current marks, seven-day trends, Cal27/Cal28 values, and prior-year settlements.",
        footer: "ICE PMI | Source: ice_python.settlements / Azure PostgreSQL",
      };
    }
    if (showLocalDevFeatures && activeSection === "gas-prices") {
      return {
        title: "Gas Pricing Workstation",
        subtitle: "ICE gas cash, BalMo, and active monthly curve snapshot by region and market.",
        footer: "Gas Pricing | ICE physical next-day gas",
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
    if (showLocalDevFeatures && activeSection === "pjm-price-view") {
      return {
        title: "Price View",
        subtitle:
          "Hourly PJM load, wind, solar, net load, Western Hub RT prices, Tetco M3 gas, and heat rate.",
        footer:
          "Price View | Source: PJM load/generation/RT LMPs + ICE Tetco M3 WVAP / Azure PostgreSQL",
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
        subtitle: "WSI hourly observed and forecast weather for PJM station coverage.",
        footer: "Weather | Source: WSI / Azure PostgreSQL",
      };
    }
    if (activeSection === "power-lmp-adders") {
      return {
        title: "LMP Adders & Reserves",
        subtitle:
          "ISO-specific price adders, reserve market results, and source contracts alongside LMPs.",
        footer: "LMP Adders | Source: promoted reserve/adders tables and source contracts",
      };
    }
    return {
      title: "Power LMPs",
      subtitle:
        "PJM, ERCOT, ISO-NE, and CAISO day-ahead, real-time, and DART power prices.",
      footer: "Power LMPs | Source: Azure PostgreSQL",
    };
  }, [activeSection, showLocalDevFeatures]);

  const isHistoricalSettlements = activeSection === "pjm-historical-settlements";
  const isIceSettlements = activeSection === "ice-settlements";
  const isCenteredWorkstation =
    isHistoricalSettlements ||
    activeSection === "spark-spreads" ||
    activeSection === "gas-prices";
  const usesPowerMarketEyebrow = isHistoricalSettlements || isIceSettlements;

  return (
    <div className="flex min-h-screen flex-col bg-[#0f1117] text-gray-100 md:flex-row">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        showLocalDevFeatures={showLocalDevFeatures}
      />

      <div className="min-w-0 flex-1 overflow-auto">
        <main className={`w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8 ${isCenteredWorkstation ? "mx-auto max-w-full md:max-w-7xl" : ""}`}>
          <div className="mb-6 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-start md:justify-between md:gap-6">
            <div className="min-w-0 max-w-full">
              <p className="mb-1 hidden text-xs font-semibold uppercase tracking-widest text-gray-500 md:block">
                {usesPowerMarketEyebrow ? "Helios CTA | Power Markets" : "HeliosCTA"}
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

            {activeSection === "power-lmp-adders" && (
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

            {activeSection === "positions-home" && (
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

            {activeSection === "nav-positions" && (
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

            {activeSection === "ice-settlements" && (
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
              initialIso={initialPjmDaLmpIso}
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
          {activeSection === "power-lmp-adders" && (
            <PowerLmpAdders
              refreshToken={powerLmpAddersRefreshToken}
              onFreshnessChange={setPowerLmpAddersFreshness}
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
          {showLocalDevFeatures && activeSection === "pjm-price-view" && (
            <PjmPriceView />
          )}
          {activeSection === "pjm-historical-settlements" && (
            <PjmHistoricalSettlements
              initialTab={searchParams.get("section") === "pjm-term-bible" ? "term-bible" : "settlements"}
            />
          )}
          {activeSection === "positions-home" && (
            <PositionsHome
              refreshToken={positionsHomeRefreshToken}
              onFreshnessChange={setPositionsHomeFreshness}
            />
          )}
          {activeSection === "nav-positions" && (
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
          {activeSection === "ice-settlements" && (
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
          {showLocalDevFeatures && activeSection === "ice-pmi-curve" && (
            <IcePmiCurveTable />
          )}
          {showLocalDevFeatures && activeSection === "gas-prices" && (
            <GasDailyPrices />
          )}
          {showLocalDevFeatures && activeSection === "pjm-generation" && (
            <PjmGeneration
              refreshToken={pjmGenerationRefreshToken}
              onFreshnessChange={setPjmGenerationFreshness}
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
