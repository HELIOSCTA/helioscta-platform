export const EIA_GENERATION_SOURCE_TABLE = "eia.eia_930_daily_generation_by_fuel";
export const EIA_REGION_DATA_SOURCE_TABLE = "eia.eia_930_daily_region_data";
export const EIA_WEATHER_DEGREE_DAY_SOURCE_TABLE =
  "weather.wsi_daily_weighted_degree_day_observations";

export const EIA_GENERATION_REGIONS = [
  {
    key: "US48",
    respondent: "US48",
    label: "US48",
    name: "United States Lower 48",
    preferredTimezone: "Eastern",
    weatherEntity: "CONUS",
    weatherEntityLabel: "CONUS",
  },
  {
    key: "PJM",
    respondent: "PJM",
    label: "PJM",
    name: "PJM Interconnection, LLC",
    preferredTimezone: "Eastern",
    weatherEntity: "EAST",
    weatherEntityLabel: "WSI East",
  },
  {
    key: "MISO",
    respondent: "MISO",
    label: "MISO",
    name: "Midcontinent Independent System Operator, Inc.",
    preferredTimezone: "Central",
    weatherEntity: "MIDWEST",
    weatherEntityLabel: "WSI Midwest",
  },
  {
    key: "ERCOT",
    respondent: "ERCO",
    label: "ERCOT",
    name: "Electric Reliability Council of Texas, Inc.",
    preferredTimezone: "Central",
    weatherEntity: "SOUTHCENTRAL",
    weatherEntityLabel: "WSI Southcentral",
  },
  {
    key: "CAISO",
    respondent: "CISO",
    label: "CAISO",
    name: "California Independent System Operator",
    preferredTimezone: "Pacific",
    weatherEntity: "PACIFIC",
    weatherEntityLabel: "WSI Pacific",
  },
  {
    key: "ISONE",
    respondent: "ISNE",
    label: "ISONE",
    name: "ISO New England",
    preferredTimezone: "Eastern",
    weatherEntity: "EAST",
    weatherEntityLabel: "WSI East",
  },
  {
    key: "NYISO",
    respondent: "NYIS",
    label: "NYISO",
    name: "New York Independent System Operator",
    preferredTimezone: "Eastern",
    weatherEntity: "EAST",
    weatherEntityLabel: "WSI East",
  },
  {
    key: "SWPP",
    respondent: "SWPP",
    label: "SWPP",
    name: "Southwest Power Pool",
    preferredTimezone: "Central",
    weatherEntity: "SOUTHCENTRAL",
    weatherEntityLabel: "WSI Southcentral",
  },
  {
    key: "TVA",
    respondent: "TVA",
    label: "TVA",
    name: "Tennessee Valley Authority",
    preferredTimezone: "Central",
    weatherEntity: "EAST",
    weatherEntityLabel: "WSI East",
  },
  {
    key: "SOCO",
    respondent: "SOCO",
    label: "SOCO",
    name: "Southern Company Services, Inc. - Trans",
    preferredTimezone: "Eastern",
    weatherEntity: "EAST",
    weatherEntityLabel: "WSI East",
  },
] as const;

export type EiaGenerationRegion = (typeof EIA_GENERATION_REGIONS)[number]["key"];

export interface EiaGenerationRegionConfig {
  key: EiaGenerationRegion;
  respondent: string;
  label: string;
  name: string;
  preferredTimezone: string;
  weatherEntity: string | null;
  weatherEntityLabel: string | null;
}

export type EiaGenerationSeason = "summer" | "winter";

export const EIA_GENERATION_SEASON_OPTIONS: Array<{
  key: EiaGenerationSeason;
  label: string;
  months: number[];
}> = [
  { key: "summer", label: "Summer (Apr-Oct)", months: [4, 5, 6, 7, 8, 9, 10] },
  { key: "winter", label: "Winter (Nov-Mar)", months: [11, 12, 1, 2, 3] },
];

export type EiaGenerationPageTab =
  | "home"
  | "monthly-averages"
  | "regional-modeling"
  | "yoy-mtd";

export const EIA_GENERATION_PAGE_TABS: Array<{
  key: EiaGenerationPageTab;
  label: string;
}> = [
  { key: "home", label: "Home" },
  { key: "monthly-averages", label: "Monthly Averages" },
  { key: "regional-modeling", label: "Regional Modeling" },
  { key: "yoy-mtd", label: "YoY + MTD" },
];

export type EiaGenerationMetricKey =
  | "gas"
  | "coal"
  | "nuke"
  | "hydro"
  | "wind"
  | "solar"
  | "other";

export type EiaGenerationYoyMetricKey =
  | "gasMw"
  | "gasThermalPct"
  | "coalMw"
  | "coalThermalPct"
  | "windMw"
  | "windSharePct"
  | "solarMw"
  | "solarSharePct";

export const EIA_DEFAULT_HEAT_RATE_MMBTU_PER_MWH = 8;

export interface EiaGenerationKpi {
  key: EiaGenerationMetricKey;
  label: string;
  valuePct: number | null;
  deltaPctPoint: number | null;
  sparkline: Array<{ date: string; valuePct: number | null }>;
}

export interface EiaGenerationWeatherPoint {
  date: string;
  year: number;
  monthDay: string;
  weatherValue: number;
  demandMw: number;
  weatherBucket: number;
  baselineDemandMw: number | null;
  demandAnomalyMw: number | null;
}

export interface EiaGenerationWeatherBucket {
  weatherBucket: number;
  weatherValue: number;
  historicalMedianDemandMw: number;
  sampleSize: number;
}

export interface EiaGenerationWeatherAnomalyRow {
  monthDay: string;
  seasonDayIndex: number;
  current: number | null;
  prior: number | null;
}

export interface EiaGenerationWeatherSeasonData {
  season: EiaGenerationSeason;
  status: "available" | "source_pending";
  entityId: string | null;
  entityLabel: string | null;
  metricName: "electric_cdd" | "electric_hdd";
  metricLabel: string;
  currentYear: number | null;
  priorYear: number | null;
  historicalPoints: EiaGenerationWeatherPoint[];
  currentPoints: EiaGenerationWeatherPoint[];
  priorPoints: EiaGenerationWeatherPoint[];
  bucketMedians: EiaGenerationWeatherBucket[];
  anomalyRows: EiaGenerationWeatherAnomalyRow[];
  currentAvgAnomalyMw: number | null;
  priorAvgAnomalyMw: number | null;
  message: string | null;
}

export interface EiaGenerationDailyRow {
  date: string;
  year: number;
  month: number;
  day: number;
  monthDay: string;
  demandMw: number | null;
  netGenerationMw: number | null;
  gasMw: number | null;
  coalMw: number | null;
  nukeMw: number | null;
  hydroMw: number | null;
  windMw: number | null;
  solarMw: number | null;
  otherMw: number | null;
  gasSharePct: number | null;
  gasThermalPct: number | null;
  thermalSharePct: number | null;
  coalSharePct: number | null;
  coalThermalPct: number | null;
  nukeSharePct: number | null;
  hydroSharePct: number | null;
  windSharePct: number | null;
  solarSharePct: number | null;
  otherSharePct: number | null;
}

export interface EiaGenerationMonthlyRow {
  month: string;
  monthNumber: number;
  currentYear: number | null;
  priorYear: number | null;
  currentDayCount: number;
  priorDayCount: number;
  demandMw: number | null;
  priorDemandMw: number | null;
  demandDeltaMw: number | null;
  netGenerationMw: number | null;
  priorNetGenerationMw: number | null;
  netGenerationDeltaMw: number | null;
  gasMw: number | null;
  priorGasMw: number | null;
  gasDeltaMw: number | null;
  coalMw: number | null;
  priorCoalMw: number | null;
  coalDeltaMw: number | null;
  nukeMw: number | null;
  hydroMw: number | null;
  priorHydroMw: number | null;
  hydroDeltaMw: number | null;
  windMw: number | null;
  priorWindMw: number | null;
  windDeltaMw: number | null;
  solarMw: number | null;
  priorSolarMw: number | null;
  solarDeltaMw: number | null;
  otherMw: number | null;
  renewableMw: number | null;
  priorRenewableMw: number | null;
  renewableDeltaMw: number | null;
  gasSharePct: number | null;
  priorGasSharePct: number | null;
  gasShareDeltaPctPoint: number | null;
  gasThermalPct: number | null;
  priorGasThermalPct: number | null;
  coalSharePct: number | null;
  nukeSharePct: number | null;
  hydroSharePct: number | null;
  windSharePct: number | null;
  solarSharePct: number | null;
  otherSharePct: number | null;
  renewableSharePct: number | null;
  priorRenewableSharePct: number | null;
}

export interface EiaGenerationMonthlyPayload {
  status: "available" | "source_pending";
  aggregationGrain: string;
  rows: EiaGenerationMonthlyRow[];
  message: string | null;
}

export interface EiaGenerationRegionalHealthItem {
  key: string;
  label: string;
  value: number | string | null;
  unit: "count" | "status" | "pct" | "mw" | "bcfd";
  status: "ok" | "warning" | "source_pending";
  detail: string;
}

export interface EiaGenerationRegionalModelRow {
  month: string;
  monthNumber: number;
  demandMw: number | null;
  netGenerationMw: number | null;
  gasMw: number | null;
  coalMw: number | null;
  thermalMw: number | null;
  nuclearHydroMw: number | null;
  renewableMw: number | null;
  residualMw: number | null;
  gasBurnBcfd: number | null;
  monthlyGasBcf: number | null;
  annualizedGasBcf: number | null;
  days: number;
  status: "available" | "source_pending";
}

export interface EiaGenerationRegionalModelingPayload {
  status: "available" | "source_pending";
  defaultHeatRateMmbtuPerMwh: number;
  heatRateSourceStatus: "default" | "source_pending";
  heatRateFormula: string;
  snapshotReleaseAt: string | null;
  snapshotStatus: "source_pending";
  health: EiaGenerationRegionalHealthItem[];
  powerBalanceRows: EiaGenerationRegionalModelRow[];
  gasDemandRows: EiaGenerationRegionalModelRow[];
  tradingViewRows: EiaGenerationRegionalModelRow[];
  message: string | null;
}

export interface EiaGenerationYoyMtdKpi {
  key:
    | "currentAvgBcfd"
    | "priorAvgBcfd"
    | "deltaAvgBcfd"
    | "currentTotalBcf"
    | "priorTotalBcf"
    | "monthEndProjectionDeltaBcf";
  label: string;
  unit: "bcfd" | "bcf";
  current: number | null;
  prior: number | null;
  delta: number | null;
  status: "available" | "source_pending";
}

export interface EiaGenerationMtdPathRow {
  day: number;
  currentDate: string | null;
  priorDate: string | null;
  currentBcfd: number | null;
  priorBcfd: number | null;
  deltaBcfd: number | null;
  currentCumulativeBcf: number | null;
  priorCumulativeBcf: number | null;
  deltaCumulativeBcf: number | null;
}

export interface EiaGenerationMtdAttributionRow {
  key: "load" | "renewables" | "coal_switch" | "nuke_hydro" | "residual";
  label: string;
  valueBcfd: number | null;
  status: "available" | "source_pending";
  detail: string;
}

export interface EiaGenerationYoyStackRow {
  section: "Gas Burn" | "Demand" | "Supply";
  metric: string;
  unit: "bcfd" | "bcf" | "mw" | "pct";
  current: number | null;
  prior: number | null;
  delta: number | null;
  status: "available" | "source_pending";
}

export interface EiaGenerationYoyMtdPayload {
  status: "available" | "source_pending";
  selectedMonth: number | null;
  selectedDay: number | null;
  heatRateMmbtuPerMwh: number;
  kpis: EiaGenerationYoyMtdKpi[];
  cumulativePath: EiaGenerationMtdPathRow[];
  attribution: EiaGenerationMtdAttributionRow[];
  dailyDeltas: EiaGenerationMtdPathRow[];
  stackRows: EiaGenerationYoyStackRow[];
  monthEndProjectionBcf: number | null;
  message: string | null;
}

export interface EiaGenerationSourceFreshness {
  sourceTable: string;
  sourceSystem: string;
  rowCount: number;
  minPeriod: string | null;
  maxPeriod: string | null;
  latestScrapeRunAt: string | null;
  latestUpdateAt: string | null;
  respondent: string;
  respondentName: string;
  selectedTimezone: string;
  rawGrain: string;
  presentationGrain: string;
  units: string;
}

export interface EiaGenerationPayload {
  product: "eia-generation";
  source: "EIA-930 daily generation and region data";
  region: EiaGenerationRegionConfig;
  requestedDate: string | null;
  selectedDate: string | null;
  latestDate: string | null;
  currentYear: number | null;
  priorYear: number | null;
  asOf: string | null;
  currentTable: EiaGenerationDailyRow[];
  priorTable: EiaGenerationDailyRow[];
  daily: EiaGenerationDailyRow[];
  kpis: EiaGenerationKpi[];
  monthly: EiaGenerationMonthlyPayload;
  regionalModeling: EiaGenerationRegionalModelingPayload;
  yoyMtd: EiaGenerationYoyMtdPayload;
  freshness: EiaGenerationSourceFreshness;
  weatherBySeason: Record<EiaGenerationSeason, EiaGenerationWeatherSeasonData>;
  demandStatus: "available" | "source_pending";
  weatherStatus: "available" | "source_pending";
  metadata: {
    fuelValueUnit: "megawatthours";
    dashboardValueUnit: "average_mw";
    conversion: "daily_mwh_divided_by_24";
    thermalDefinition: "gas_plus_coal";
    sourceContract: string;
    demandSourceTable: string;
    weatherSourceTable: string;
    weatherMappingContract: string;
    missingSources: string[];
  };
}

export const EIA_GENERATION_FUEL_COLORS: Record<EiaGenerationMetricKey, string> = {
  gas: "#f59e0b",
  coal: "#9ca3af",
  nuke: "#818cf8",
  hydro: "#3b82f6",
  wind: "#06b6d4",
  solar: "#eab308",
  other: "#a855f7",
};

export function getEiaGenerationRegion(
  value: string | null | undefined,
): EiaGenerationRegionConfig {
  const normalized = value?.trim().toUpperCase();
  return (
    EIA_GENERATION_REGIONS.find((region) => region.key === normalized) ??
    EIA_GENERATION_REGIONS[0]
  );
}
