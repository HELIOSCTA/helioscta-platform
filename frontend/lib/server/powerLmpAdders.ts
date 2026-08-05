import "server-only";

import { query } from "@/lib/server/db";

export type PowerLmpAdderIso = "pjm" | "ercot";
export type PowerLmpAdderDataset =
  | "pjm-da-reserve-mcp"
  | "pjm-rt-reserve-mcp"
  | "pjm-rt-ancillary-services"
  | "ercot-rt-price-adders-sced"
  | "ercot-rt-price-adders-15min";

type DatasetStatus = "live" | "pending" | "reference";
type MetricValueUnit = "price" | "mw" | "ratio";
type ReportRowStatus = "ok" | "partial" | "missing";

interface DimensionColumn {
  key: string;
  label: string;
  sourceField: string | null;
}

interface MetricColumn {
  key: string;
  label: string;
  sourceField: string | null;
  unit: MetricValueUnit;
}

interface DatasetContract {
  grain: string;
  timeBasis: string;
  valueField: string;
  aggregation: string;
  peakBlock: string;
  refresh: string;
  dimensions: string[];
  fields: string[];
  notes: string[];
}

interface DatasetConfig {
  dataset: PowerLmpAdderDataset;
  iso: PowerLmpAdderIso;
  sourceMode: "pjm-reserve" | "pjm-ancillary" | "ercot-sced" | "ercot-15min";
  isoLabel: string;
  market: "da" | "rt" | "reference";
  label: string;
  valueLabel: string;
  sourceLabel: string;
  sourceUrl: string;
  sourceTable: string | null;
  status: DatasetStatus;
  description: string;
  contract: DatasetContract;
  dimensionColumns: DimensionColumn[];
  metricColumns: MetricColumn[];
  defaultColumnFilters?: Record<string, string[]>;
}

interface HourValueRow {
  market_date: string;
  hour_ending: number;
  value: number | string | null;
  as_of: string | null;
  source_row_count: number | string | null;
  [key: string]: string | number | null;
}

export interface PowerLmpAddersReportRow {
  iso: PowerLmpAdderIso;
  isoLabel: string;
  dataset: PowerLmpAdderDataset;
  datasetLabel: string;
  market: "da" | "rt";
  metricKey: string;
  metricLabel: string;
  sourceLabel: string;
  sourceTable: string | null;
  targetDate: string;
  onPeakAvg: number | null;
  offPeakAvg: number | null;
  flatAvg: number | null;
  peakHour: number | null;
  peakValue: number | null;
  observationCount: number;
  expectedObservationCount: number;
  seriesCount: number;
  sourceRowCount: number;
  latestAsOf: string | null;
  status: ReportRowStatus;
  statusDetail: string;
  detailUrl: string;
}

export interface PowerLmpAddersReportSummary {
  targetDate: string;
  latestAsOf: string | null;
  rowCount: number;
  completeRowCount: number;
  partialRowCount: number;
  missingRowCount: number;
  rows: PowerLmpAddersReportRow[];
}

const METRIC_DIMENSION_COLUMN: DimensionColumn = {
  key: "metric",
  label: "Metric",
  sourceField: null,
};

const PJM_DA_RESERVE_FIELDS = [
  "datetime_beginning_ept",
  "datetime_beginning_utc",
  "locale",
  "service",
  "mcp",
  "mcp_capped",
  "as_mw",
  "as_req_mw",
  "total_mw",
] as const;

const PJM_RT_RESERVE_FIELDS = [
  "datetime_beginning_ept",
  "datetime_beginning_utc",
  "locale",
  "service",
  "mcp",
  "mcp_capped",
  "as_mw",
  "as_req_mw",
  "reg_ccp",
  "reg_pcp",
  "total_mw",
] as const;

const PJM_ANCILLARY_SERVICE_FIELDS = [
  "ancillary_service",
  "datetime_beginning_ept",
  "datetime_beginning_utc",
  "row_is_current",
  "unit",
  "value",
  "version_nbr",
] as const;

const PJM_DA_RESERVE_METRICS: MetricColumn[] = [
  { key: "mcp", label: "MCP", sourceField: "mcp", unit: "price" },
  { key: "mcp_capped", label: "MCP Capped", sourceField: "mcp_capped", unit: "price" },
  { key: "as_mw", label: "AS MW", sourceField: "as_mw", unit: "mw" },
  { key: "as_req_mw", label: "AS Req MW", sourceField: "as_req_mw", unit: "mw" },
  { key: "total_mw", label: "Total MW", sourceField: "total_mw", unit: "mw" },
];

const PJM_RT_RESERVE_METRICS: MetricColumn[] = [
  ...PJM_DA_RESERVE_METRICS,
  { key: "reg_ccp", label: "Reg CCP", sourceField: "reg_ccp", unit: "price" },
  { key: "reg_pcp", label: "Reg PCP", sourceField: "reg_pcp", unit: "price" },
];

const PJM_ANCILLARY_SERVICE_METRICS: MetricColumn[] = [
  {
    key: "mad-non-synchronized-reserve-price",
    label: "MAD Non-Synchronized Reserve Price",
    sourceField: "MAD Non-Synchronized Reserve",
    unit: "price",
  },
  {
    key: "mad-secondary-reserve-price",
    label: "MAD Secondary Reserve Price",
    sourceField: "MAD Secondary Reserve",
    unit: "price",
  },
  {
    key: "mad-synchronized-reserve-price",
    label: "MAD Synchronized Reserve Price",
    sourceField: "MAD Synchronized Reserve",
    unit: "price",
  },
  {
    key: "rto-non-synchronized-reserve-price",
    label: "RTO Non-Synchronized Reserve Price",
    sourceField: "RTO Non-Synchronized Reserve",
    unit: "price",
  },
  {
    key: "rto-regulation-capability-price",
    label: "RTO Regulation Capability Price",
    sourceField: "RTO Regulation Capability",
    unit: "price",
  },
  {
    key: "rto-regulation-mileage-price",
    label: "RTO Regulation Mileage Price",
    sourceField: "RTO Regulation Mileage",
    unit: "price",
  },
  {
    key: "rto-secondary-reserve-price",
    label: "RTO Secondary Reserve Price",
    sourceField: "RTO Secondary Reserve",
    unit: "price",
  },
  {
    key: "rto-synchronized-reserve-price",
    label: "RTO Synchronized Reserve Price",
    sourceField: "RTO Synchronized Reserve",
    unit: "price",
  },
  {
    key: "rto-mileage-ratio",
    label: "RTO Mileage Ratio",
    sourceField: "RTO Mileage Ratio",
    unit: "ratio",
  },
];

const ERCOT_SCED_PRICE_ADDER_FIELDS = [
  "scedtimestamp",
  "repeathourflag",
  "systemlambda",
  "rtrdpa",
  "rtrdparus",
  "rtrdpards",
  "rtrdparrs",
  "rtrdpaecrs",
  "rtrdpanss",
  "rtrruc",
  "rtrrmr",
  "rtdnclr",
  "rtders",
  "rtdctieimport",
  "rtdctieexport",
  "rtbltimport",
  "rtbltexport",
  "rtollsl",
  "rtolhsl",
] as const;

const ERCOT_15MIN_PRICE_ADDER_FIELDS = [
  "deliverydate",
  "deliveryhour",
  "deliveryinterval",
  "rtrdpa",
  "rtrdpru",
  "rtrdprd",
  "rtrdprrs",
  "rtrdpecrs",
  "rtrdpns",
  "repeathourflag",
] as const;

const ERCOT_SCED_PRICE_ADDER_METRICS: MetricColumn[] = [
  { key: "rtrdpa", label: "RTRDPA", sourceField: "rtrdpa", unit: "price" },
  { key: "rtrdparus", label: "RTRDPA RUS", sourceField: "rtrdparus", unit: "price" },
  { key: "rtrdpards", label: "RTRDPA RDS", sourceField: "rtrdpards", unit: "price" },
  { key: "rtrdparrs", label: "RTRDPA RRS", sourceField: "rtrdparrs", unit: "price" },
  { key: "rtrdpaecrs", label: "RTRDPA ECRS", sourceField: "rtrdpaecrs", unit: "price" },
  { key: "rtrdpanss", label: "RTRDPA NSS", sourceField: "rtrdpanss", unit: "price" },
  { key: "rtrruc", label: "RTRRUC", sourceField: "rtrruc", unit: "price" },
  { key: "rtrrmr", label: "RTRRMR", sourceField: "rtrrmr", unit: "price" },
  { key: "systemlambda", label: "System Lambda", sourceField: "systemlambda", unit: "price" },
];

const ERCOT_15MIN_PRICE_ADDER_METRICS: MetricColumn[] = [
  { key: "rtrdpa", label: "RTRDPA", sourceField: "rtrdpa", unit: "price" },
  { key: "rtrdpru", label: "RTRDPRU", sourceField: "rtrdpru", unit: "price" },
  { key: "rtrdprd", label: "RTRDPRD", sourceField: "rtrdprd", unit: "price" },
  { key: "rtrdprrs", label: "RTRDPRRS", sourceField: "rtrdprrs", unit: "price" },
  { key: "rtrdpecrs", label: "RTRDPECRS", sourceField: "rtrdpecrs", unit: "price" },
  { key: "rtrdpns", label: "RTRDPNS", sourceField: "rtrdpns", unit: "price" },
];

const DATASETS: Record<PowerLmpAdderDataset, DatasetConfig> = {
  "pjm-da-reserve-mcp": {
    dataset: "pjm-da-reserve-mcp",
    iso: "pjm",
    sourceMode: "pjm-reserve",
    isoLabel: "PJM",
    market: "da",
    label: "DA Reserve Metrics",
    valueLabel: "Reserve Metrics",
    sourceLabel: "PJM Data Miner da_reserve_market_results",
    sourceUrl: "https://dataminer2.pjm.com/feed/da_reserve_market_results/definition",
    sourceTable: "pjm.da_reserve_market_results",
    status: "live",
    description:
      "One row per date, locale, service, and metric; MCP rows are prices and MW rows are reserve quantities.",
    contract: {
      grain: "market hour x locale x reserve service",
      timeBasis: "PJM Eastern Prevailing Time, hourly",
      valueField: "selectable reserve result metric; MCP metrics are prices and MW metrics are quantities",
      aggregation: "one row per date, locale, service, and metric; daily blocks average that row's hourly values",
      peakBlock: "PJM block: HE8-HE23",
      refresh: "Published daily after DA ancillary service market results; promoted table is live",
      dimensions: ["locale", "service"],
      fields: [...PJM_DA_RESERVE_FIELDS],
      notes: [
        "This is not an LMP component. It is a reserve market clearing price by PJM reserve product and zone.",
        "Multiple rows per date are expected because PJM publishes separate locale/service/metric series.",
        "Use the Metric column filter to isolate MCP, MCP Capped, or MW quantities.",
      ],
    },
    dimensionColumns: [
      { key: "locale", label: "Locale", sourceField: "locale" },
      { key: "service", label: "Service", sourceField: "service" },
    ],
    metricColumns: PJM_DA_RESERVE_METRICS,
  },
  "pjm-rt-reserve-mcp": {
    dataset: "pjm-rt-reserve-mcp",
    iso: "pjm",
    sourceMode: "pjm-reserve",
    isoLabel: "PJM",
    market: "rt",
    label: "RT Reserve Metrics",
    valueLabel: "Reserve Metrics",
    sourceLabel: "PJM Data Miner reserve_market_results",
    sourceUrl: "https://dataminer2.pjm.com/feed/reserve_market_results/definition",
    sourceTable: "pjm.reserve_market_results",
    status: "live",
    description:
      "One row per date, locale, service, and metric; MCP and regulation rows are prices and MW rows are reserve quantities.",
    contract: {
      grain: "market hour x locale x reserve service",
      timeBasis: "PJM Eastern Prevailing Time, hourly",
      valueField: "selectable reserve result metric; MCP/regulation metrics are prices and MW metrics are quantities",
      aggregation: "one row per date, locale, service, and metric; daily blocks average that row's hourly values",
      peakBlock: "PJM block: HE8-HE23",
      refresh: "Daily business-day PJM Data Miner feed; promoted table is live",
      dimensions: ["locale", "service"],
      fields: [...PJM_RT_RESERVE_FIELDS],
      notes: [
        "RT reserve results carry additional regulation fields exposed through the Metric column filter.",
        "Multiple rows per date are expected because PJM publishes separate locale/service/metric series.",
      ],
    },
    dimensionColumns: [
      { key: "locale", label: "Locale", sourceField: "locale" },
      { key: "service", label: "Service", sourceField: "service" },
    ],
    metricColumns: PJM_RT_RESERVE_METRICS,
  },
  "pjm-rt-ancillary-services": {
    dataset: "pjm-rt-ancillary-services",
    iso: "pjm",
    sourceMode: "pjm-ancillary",
    isoLabel: "PJM",
    market: "rt",
    label: "RT Ancillary",
    valueLabel: "Ancillary Service",
    sourceLabel: "PJM Data Miner ancillary_services",
    sourceUrl: "https://dataminer2.pjm.com/feed/ancillary_services/definition",
    sourceTable: "pjm.ancillary_services",
    status: "live",
    description:
      "One row per date and ancillary service metric; price rows are RT ancillary prices and RTO Mileage Ratio is a ratio.",
    contract: {
      grain: "market hour x ancillary service x current-row flag x version",
      timeBasis: "PJM Eastern Prevailing Time, hourly",
      valueField: "row-shaped ancillary service value; price services are prices and RTO Mileage Ratio is a ratio",
      aggregation: "current rows are averaged to HE1-HE24 by market date and ancillary service",
      peakBlock: "PJM block: HE8-HE23",
      refresh: "Daily business-day PJM Data Miner feed with 14-day hot retention; promoted table is live",
      dimensions: ["ancillary_service"],
      fields: [...PJM_ANCILLARY_SERVICE_FIELDS],
      notes: [
        "This is not an LMP component. It is a real-time ancillary service price and ratio feed.",
        "Only current PJM rows are included by filtering row_is_current = true.",
        "RTO Mileage Ratio is exposed in the Metric column filter but hidden by default because it is not a price metric.",
      ],
    },
    dimensionColumns: [],
    metricColumns: PJM_ANCILLARY_SERVICE_METRICS,
  },
  "ercot-rt-price-adders-sced": {
    dataset: "ercot-rt-price-adders-sced",
    iso: "ercot",
    sourceMode: "ercot-sced",
    isoLabel: "ERCOT",
    market: "rt",
    label: "RT Adders SCED",
    valueLabel: "RT Price Adder",
    sourceLabel: "ERCOT NP6-323-CD",
    sourceUrl: "https://www.ercot.com/mp/data-products/data-product-details?id=NP6-323-CD",
    sourceTable: "ercot.rt_price_adders_sced",
    status: "live",
    description:
      "One row per date and metric; SCED interval rows are averaged into hourly buckets.",
    contract: {
      grain: "SCED timestamp x repeat-hour flag",
      timeBasis: "ERCOT market time, SCED interval",
      valueField: "selectable real-time price adder metric",
      aggregation: "SCED interval values are averaged to HE1-HE24 by market date and metric",
      peakBlock: "ERCOT block: HE7-HE22",
      refresh: "Daily ERCOT price adders batch; promoted table is live",
      dimensions: [],
      fields: [...ERCOT_SCED_PRICE_ADDER_FIELDS],
      notes: [
        "This dataset is ERCOT real-time price adders by SCED interval, not an LMP table.",
        "Use the Metric column filter to inspect RTRDPA components or System Lambda.",
      ],
    },
    dimensionColumns: [],
    metricColumns: ERCOT_SCED_PRICE_ADDER_METRICS,
  },
  "ercot-rt-price-adders-15min": {
    dataset: "ercot-rt-price-adders-15min",
    iso: "ercot",
    sourceMode: "ercot-15min",
    isoLabel: "ERCOT",
    market: "rt",
    label: "RT Adders 15-Min",
    valueLabel: "RT Price Adder",
    sourceLabel: "ERCOT NP6-324-CD",
    sourceUrl: "https://www.ercot.com/mp/data-products/data-product-details?id=NP6-324-CD",
    sourceTable: "ercot.rt_price_adders_15min",
    status: "live",
    description:
      "One row per date and metric; 15-minute settlement intervals are averaged into hourly buckets.",
    contract: {
      grain: "delivery date x delivery hour x delivery interval x repeat-hour flag",
      timeBasis: "ERCOT market time, 15-minute settlement interval",
      valueField: "selectable real-time price adder metric",
      aggregation: "15-minute interval values are averaged to HE1-HE24 by market date and metric",
      peakBlock: "ERCOT block: HE7-HE22",
      refresh: "Daily ERCOT price adders batch; promoted table is live",
      dimensions: [],
      fields: [...ERCOT_15MIN_PRICE_ADDER_FIELDS],
      notes: [
        "This dataset is ERCOT real-time price adders at settlement interval grain.",
        "The hourly table averages four delivery intervals when all intervals are present.",
      ],
    },
    dimensionColumns: [],
    metricColumns: ERCOT_15MIN_PRICE_ADDER_METRICS,
  },
};

const DATASETS_BY_ISO: Record<PowerLmpAdderIso, PowerLmpAdderDataset[]> = {
  pjm: ["pjm-da-reserve-mcp", "pjm-rt-reserve-mcp", "pjm-rt-ancillary-services"],
  ercot: ["ercot-rt-price-adders-sced", "ercot-rt-price-adders-15min"],
};
const REPORT_DATASETS: PowerLmpAdderDataset[] = [
  "pjm-da-reserve-mcp",
  "pjm-rt-reserve-mcp",
  "pjm-rt-ancillary-services",
  "ercot-rt-price-adders-sced",
  "ercot-rt-price-adders-15min",
];

const HOURS = Array.from({ length: 24 }, (_, index) => index + 1);
const PEAK_WINDOW_BY_ISO: Record<PowerLmpAdderIso, { start: number; end: number }> = {
  pjm: { start: 8, end: 23 },
  ercot: { start: 7, end: 22 },
};

function onPeakHoursForIso(iso: PowerLmpAdderIso): number[] {
  const window = PEAK_WINDOW_BY_ISO[iso];
  return HOURS.filter((hour) => hour >= window.start && hour <= window.end);
}

function offPeakHoursForIso(iso: PowerLmpAdderIso): number[] {
  const window = PEAK_WINDOW_BY_ISO[iso];
  return HOURS.filter((hour) => hour < window.start || hour > window.end);
}

export function parsePowerLmpAdderIso(raw: string | null): PowerLmpAdderIso {
  return raw === "ercot" ? "ercot" : "pjm";
}

export function parsePowerLmpAdderDataset(
  raw: string | null,
  iso: PowerLmpAdderIso,
): PowerLmpAdderDataset {
  const options = DATASETS_BY_ISO[iso];
  if (raw && options.includes(raw as PowerLmpAdderDataset)) {
    return raw as PowerLmpAdderDataset;
  }
  return options[0];
}

export function parseDate(raw: string | null): string | null {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number | null, digits = 2): number | null {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value !== null);
  if (nums.length === 0) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function emptyHours(): Array<number | null> {
  return Array.from({ length: 24 }, () => null);
}

function maxStamp(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function maxHourlyValue(values: Array<number | null>): { hour: number | null; value: number | null } {
  let peakHour: number | null = null;
  let peakValue: number | null = null;
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) return;
    if (peakValue === null || value > peakValue) {
      peakHour = index + 1;
      peakValue = value;
    }
  });
  return { hour: peakHour, value: peakValue };
}

function inclusiveDayCount(start: string, end: string): number {
  const startTime = new Date(`${start}T00:00:00Z`).getTime();
  const endTime = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return 0;
  return Math.floor((endTime - startTime) / 86_400_000) + 1;
}

async function latestLiveDate(config: DatasetConfig): Promise<string | null> {
  if (!config.sourceTable) return null;
  if (config.sourceMode === "ercot-sced") {
    const rows = await query<{ target_date: string | null }>(
      `
        select max(scedtimestamp::date)::text as target_date
        from ${config.sourceTable}
      `,
    );
    return rows[0]?.target_date ?? null;
  }
  if (config.sourceMode === "ercot-15min") {
    const rows = await query<{ target_date: string | null }>(
      `
        select max(deliverydate)::text as target_date
        from ${config.sourceTable}
      `,
    );
    return rows[0]?.target_date ?? null;
  }
  if (config.sourceMode === "pjm-ancillary") {
    const rows = await query<{ target_date: string | null }>(
      `
        select max(datetime_beginning_ept::date)::text as target_date
        from ${config.sourceTable}
        where row_is_current = true
      `,
    );
    return rows[0]?.target_date ?? null;
  }
  const rows = await query<{ target_date: string | null }>(
    `
      select max(datetime_beginning_ept::date)::text as target_date
      from ${config.sourceTable}
    `,
  );
  return rows[0]?.target_date ?? null;
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function datasetDimensionColumns(config: DatasetConfig): DimensionColumn[] {
  return config.metricColumns.length > 1
    ? [...config.dimensionColumns, METRIC_DIMENSION_COLUMN]
    : config.dimensionColumns;
}

function defaultColumnFilters(config: DatasetConfig): Record<string, string[]> {
  const priceMetrics = config.metricColumns
    .filter((metric) => metric.unit === "price")
    .map((metric) => metric.label);
  if (priceMetrics.length === 0 || priceMetrics.length === config.metricColumns.length) {
    return config.defaultColumnFilters ?? {};
  }
  return {
    ...(config.defaultColumnFilters ?? {}),
    metric: priceMetrics,
  };
}

async function hourlyRows({
  config,
  metrics,
  startDate,
  endDate,
}: {
  config: DatasetConfig;
  metrics: MetricColumn[];
  startDate: string;
  endDate: string;
}): Promise<HourValueRow[]> {
  if (!config.sourceTable) {
    throw new Error(`No live source table configured for ${config.dataset}`);
  }
  if (config.sourceMode === "pjm-ancillary") {
    const metricValuesSql = metrics
      .map(
        (metric) =>
          `(${sqlText(metric.key)}, ${sqlText(metric.label)}, ${sqlText(metric.sourceField ?? metric.label)})`,
      )
      .join(",\n          ");
    if (metrics.length === 0) {
      throw new Error(`No ancillary services configured for ${config.sourceTable}`);
    }
    return query<HourValueRow>(
      `
        select
          datetime_beginning_ept::date::text as market_date,
          metric.metric_label as metric,
          (extract(hour from datetime_beginning_ept)::int + 1) as hour_ending,
          avg(value)::float8 as value,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of,
          count(*)::int as source_row_count
        from ${config.sourceTable}
        join (
          values
            ${metricValuesSql}
        ) as metric(metric_key, metric_label, source_service)
          on ancillary_service = metric.source_service
        where datetime_beginning_ept::date between $1::date and $2::date
          and row_is_current = true
        group by
          datetime_beginning_ept::date,
          metric.metric_key,
          metric.metric_label,
          extract(hour from datetime_beginning_ept)
        order by
          datetime_beginning_ept::date,
          metric.metric_key,
          extract(hour from datetime_beginning_ept)
      `,
      [startDate, endDate],
    );
  }
  const liveMetrics = metrics.filter(
    (metric): metric is MetricColumn & { sourceField: string } => Boolean(metric.sourceField),
  );
  if (liveMetrics.length === 0) {
    throw new Error(`No live metric fields configured for ${config.sourceTable}`);
  }
  const metricValuesSql = liveMetrics
    .map(
      (metric) =>
        `(${sqlText(metric.key)}, ${sqlText(metric.label)}, ${metric.sourceField})`,
    )
    .join(",\n          ");

  if (config.sourceMode === "ercot-sced") {
    return query<HourValueRow>(
      `
        select
          scedtimestamp::date::text as market_date,
          metric.metric_label as metric,
          (extract(hour from scedtimestamp)::int + 1) as hour_ending,
          avg(metric.value)::float8 as value,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of,
          count(*)::int as source_row_count
        from ${config.sourceTable}
        cross join lateral (
          values
            ${metricValuesSql}
        ) as metric(metric_key, metric_label, value)
        where scedtimestamp::date between $1::date and $2::date
        group by
          scedtimestamp::date,
          metric.metric_key,
          metric.metric_label,
          extract(hour from scedtimestamp)
        order by
          scedtimestamp::date,
          metric.metric_key,
          extract(hour from scedtimestamp)
      `,
      [startDate, endDate],
    );
  }

  if (config.sourceMode === "ercot-15min") {
    return query<HourValueRow>(
      `
        select
          deliverydate::text as market_date,
          metric.metric_label as metric,
          deliveryhour as hour_ending,
          avg(metric.value)::float8 as value,
          to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of,
          count(*)::int as source_row_count
        from ${config.sourceTable}
        cross join lateral (
          values
            ${metricValuesSql}
        ) as metric(metric_key, metric_label, value)
        where deliverydate between $1::date and $2::date
        group by
          deliverydate,
          metric.metric_key,
          metric.metric_label,
          deliveryhour
        order by
          deliverydate,
          metric.metric_key,
          deliveryhour
      `,
      [startDate, endDate],
    );
  }

  return query<HourValueRow>(
    `
      select
        datetime_beginning_ept::date::text as market_date,
        locale,
        service,
        metric.metric_label as metric,
        (extract(hour from datetime_beginning_ept)::int + 1) as hour_ending,
        max(metric.value)::float8 as value,
        to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of,
        count(*)::int as source_row_count
      from ${config.sourceTable}
      cross join lateral (
        values
          ${metricValuesSql}
      ) as metric(metric_key, metric_label, value)
      where datetime_beginning_ept::date between $1::date and $2::date
      group by
        datetime_beginning_ept::date,
        locale,
        service,
        metric.metric_key,
        metric.metric_label,
        extract(hour from datetime_beginning_ept)
      order by
        datetime_beginning_ept::date,
        locale,
        service,
        metric.metric_key,
        extract(hour from datetime_beginning_ept)
    `,
    [startDate, endDate],
  );
}

function buildDailyRows({
  iso,
  dimensionColumns,
  rows,
}: {
  iso: PowerLmpAdderIso;
  dimensionColumns: DimensionColumn[];
  rows: HourValueRow[];
}) {
  const byRow = new Map<
    string,
    {
      date: string;
      dimensions: Record<string, string>;
      hourly: Array<number | null>;
      asOf: string | null;
      sourceRowCount: number;
    }
  >();
  for (const row of rows) {
    const dimensions = Object.fromEntries(
      dimensionColumns.map((column) => [
        column.key,
        String(row[column.key] ?? "-"),
      ]),
    );
    const rowKey = [
      row.market_date,
      ...dimensionColumns.map((column) => dimensions[column.key]),
    ].join("|");
    const item = byRow.get(rowKey) ?? {
      date: row.market_date,
      dimensions,
      hourly: emptyHours(),
      asOf: null,
      sourceRowCount: 0,
    };
    item.hourly[Number(row.hour_ending) - 1] = round(toNumber(row.value));
    item.asOf = maxStamp([item.asOf, row.as_of]);
    item.sourceRowCount += Number(row.source_row_count ?? 0);
    byRow.set(rowKey, item);
  }

  return [...byRow.values()]
    .map((item) => ({
      date: item.date,
      dimensions: item.dimensions,
      hourly: item.hourly,
      onPeakAvg: round(avg(onPeakHoursForIso(iso).map((hour) => item.hourly[hour - 1] ?? null))),
      offPeakAvg: round(avg(offPeakHoursForIso(iso).map((hour) => item.hourly[hour - 1] ?? null))),
      asOf: item.asOf,
      sourceRowCount: item.sourceRowCount,
    }))
    .sort((left, right) => {
      const dateCompare = left.date.localeCompare(right.date);
      if (dateCompare !== 0) return dateCompare;
      return dimensionColumns
        .map((column) => (left.dimensions[column.key] ?? "").localeCompare(right.dimensions[column.key] ?? ""))
        .find((compare) => compare !== 0) ?? 0;
    });
}

function datasetOptions(iso: PowerLmpAdderIso): DatasetConfig[] {
  return DATASETS_BY_ISO[iso].map((dataset) => DATASETS[dataset]);
}

function powerLmpAdderDetailUrl({
  config,
  targetDate,
}: {
  config: DatasetConfig;
  targetDate: string;
}): string {
  const params = new URLSearchParams({
    section: "power-lmp-adders",
    iso: config.iso,
    dataset: config.dataset,
    date: targetDate,
    refresh: "1",
  });
  return `/?${params.toString()}`;
}

function emptyReportRow({
  config,
  metric,
  targetDate,
  statusDetail,
}: {
  config: DatasetConfig;
  metric: MetricColumn;
  targetDate: string;
  statusDetail: string;
}): PowerLmpAddersReportRow {
  return {
    iso: config.iso,
    isoLabel: config.isoLabel,
    dataset: config.dataset,
    datasetLabel: config.label,
    market: config.market === "da" ? "da" : "rt",
    metricKey: metric.key,
    metricLabel: metric.label,
    sourceLabel: config.sourceLabel,
    sourceTable: config.sourceTable,
    targetDate,
    onPeakAvg: null,
    offPeakAvg: null,
    flatAvg: null,
    peakHour: null,
    peakValue: null,
    observationCount: 0,
    expectedObservationCount: 24,
    seriesCount: 0,
    sourceRowCount: 0,
    latestAsOf: null,
    status: "missing",
    statusDetail,
    detailUrl: powerLmpAdderDetailUrl({ config, targetDate }),
  };
}

function buildReportRow({
  config,
  metric,
  targetDate,
  rows,
}: {
  config: DatasetConfig;
  metric: MetricColumn;
  targetDate: string;
  rows: HourValueRow[];
}): PowerLmpAddersReportRow {
  const metricRows = rows.filter((row) => row.metric === metric.label);
  if (metricRows.length === 0) {
    return emptyReportRow({
      config,
      metric,
      targetDate,
      statusDetail: "No hourly values returned for this price metric.",
    });
  }

  const hourlyValues = HOURS.map((hour) =>
    round(
      avg(
        metricRows
          .filter((row) => Number(row.hour_ending) === hour)
          .map((row) => toNumber(row.value)),
      ),
    ),
  );
  const observationCount = hourlyValues.filter((value) => value !== null).length;
  const status: ReportRowStatus =
    observationCount >= HOURS.length ? "ok" : observationCount > 0 ? "partial" : "missing";
  const seriesKeys = new Set(
    metricRows.map((row) =>
      config.dimensionColumns.length === 0
        ? metric.key
        : config.dimensionColumns.map((column) => String(row[column.key] ?? "-")).join("|"),
    ),
  );
  const peak = maxHourlyValue(hourlyValues);
  const statusDetail =
    status === "ok"
      ? "All 24 hourly buckets returned values."
      : status === "partial"
        ? `${observationCount}/24 hourly buckets returned values.`
        : "No hourly values returned for this price metric.";

  return {
    iso: config.iso,
    isoLabel: config.isoLabel,
    dataset: config.dataset,
    datasetLabel: config.label,
    market: config.market === "da" ? "da" : "rt",
    metricKey: metric.key,
    metricLabel: metric.label,
    sourceLabel: config.sourceLabel,
    sourceTable: config.sourceTable,
    targetDate,
    onPeakAvg: round(avg(onPeakHoursForIso(config.iso).map((hour) => hourlyValues[hour - 1] ?? null))),
    offPeakAvg: round(avg(offPeakHoursForIso(config.iso).map((hour) => hourlyValues[hour - 1] ?? null))),
    flatAvg: round(avg(hourlyValues)),
    peakHour: peak.hour,
    peakValue: round(peak.value),
    observationCount,
    expectedObservationCount: HOURS.length,
    seriesCount: metricRows.length > 0 ? seriesKeys.size : 0,
    sourceRowCount: metricRows.reduce(
      (sum, row) => sum + Number(row.source_row_count ?? 0),
      0,
    ),
    latestAsOf: maxStamp(metricRows.map((row) => row.as_of)),
    status,
    statusDetail,
    detailUrl: powerLmpAdderDetailUrl({ config, targetDate }),
  };
}

async function buildDatasetReportRows({
  config,
  targetDate,
}: {
  config: DatasetConfig;
  targetDate: string;
}): Promise<PowerLmpAddersReportRow[]> {
  const priceMetrics = config.metricColumns.filter((metric) => metric.unit === "price");
  if (priceMetrics.length === 0) return [];
  if (config.status !== "live" || !config.sourceTable) {
    return priceMetrics.map((metric) =>
      emptyReportRow({
        config,
        metric,
        targetDate,
        statusDetail: "Dataset is not backed by a live promoted table.",
      }),
    );
  }

  try {
    const rows = await hourlyRows({
      config,
      metrics: priceMetrics,
      startDate: targetDate,
      endDate: targetDate,
    });
    return priceMetrics.map((metric) => buildReportRow({ config, metric, targetDate, rows }));
  } catch (error) {
    const detail =
      error instanceof Error
        ? `Failed to summarize dataset: ${error.message}`
        : "Failed to summarize dataset.";
    return priceMetrics.map((metric) =>
      emptyReportRow({
        config,
        metric,
        targetDate,
        statusDetail: detail,
      }),
    );
  }
}

export async function buildPowerLmpAddersReportSummary({
  targetDate,
}: {
  targetDate: string;
}): Promise<PowerLmpAddersReportSummary> {
  const rows = (
    await Promise.all(
      REPORT_DATASETS.map((dataset) =>
        buildDatasetReportRows({
          config: DATASETS[dataset],
          targetDate,
        }),
      ),
    )
  ).flat();

  return {
    targetDate,
    latestAsOf: maxStamp(rows.map((row) => row.latestAsOf)),
    rowCount: rows.length,
    completeRowCount: rows.filter((row) => row.status === "ok").length,
    partialRowCount: rows.filter((row) => row.status === "partial").length,
    missingRowCount: rows.filter((row) => row.status === "missing").length,
    rows,
  };
}

function nonLivePayload({
  config,
  startDate,
  endDate,
}: {
  config: DatasetConfig;
  startDate: string;
  endDate: string;
}) {
  return {
    iso: config.iso,
    isoLabel: config.isoLabel,
    dataset: config.dataset,
    datasetLabel: config.label,
    valueLabel: config.valueLabel,
    status: config.status,
    description: config.description,
    contract: config.contract,
    dimensionColumns: datasetDimensionColumns(config),
    metricColumns: config.metricColumns,
    defaultColumnFilters: defaultColumnFilters(config),
    sourceLabel: config.sourceLabel,
    sourceUrl: config.sourceUrl,
    sourceTable: config.sourceTable,
    startDate,
    endDate,
    latestDate: null,
    latestAsOf: null,
    summary: {
      rowCount: 0,
      latestDate: null,
      latestAsOf: null,
    },
    rows: [],
    datasetOptions: datasetOptions(config.iso),
  };
}

export async function buildPowerLmpAddersPayload({
  iso,
  dataset,
  start,
  end,
}: {
  iso: PowerLmpAdderIso;
  dataset: PowerLmpAdderDataset;
  start: string | null;
  end: string | null;
}) {
  const config = DATASETS[dataset];
  if (config.iso !== iso) {
    return {
      status: 400,
      payload: { error: `${dataset} is not a ${iso} dataset` },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
      dataAsOf: null,
    };
  }

  const latestDate =
    config.status === "live" && config.sourceTable ? await latestLiveDate(config) : null;
  const fallbackDate = latestDate ?? new Date().toISOString().slice(0, 10);
  const startDate = start ?? fallbackDate;
  const endDate = end ?? startDate;
  const dayCount = inclusiveDayCount(startDate, endDate);

  if (dayCount < 1) {
    return {
      status: 400,
      payload: { error: "end must be on or after start" },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
      dataAsOf: null,
    };
  }

  if (config.status !== "live" || !config.sourceTable) {
    const payload = nonLivePayload({ config, startDate, endDate });
    return {
      payload,
      rowCount: 0,
      dataAsOf: null,
    };
  }

  const dimensionColumns = datasetDimensionColumns(config);
  const rows = await hourlyRows({
    config,
    metrics: config.metricColumns,
    startDate,
    endDate,
  });
  const dailyRows = buildDailyRows({ iso, dimensionColumns, rows });
  const latestAsOf = maxStamp(dailyRows.map((row) => row.asOf));

  return {
    payload: {
      iso: config.iso,
      isoLabel: config.isoLabel,
      dataset: config.dataset,
      datasetLabel: config.label,
      valueLabel: config.valueLabel,
      status: config.status,
      description: config.description,
      contract: config.contract,
      dimensionColumns,
      metricColumns: config.metricColumns,
      defaultColumnFilters: defaultColumnFilters(config),
      sourceLabel: config.sourceLabel,
      sourceUrl: config.sourceUrl,
      sourceTable: config.sourceTable,
      startDate,
      endDate,
      latestDate,
      latestAsOf,
      summary: {
        rowCount: dailyRows.length,
        latestDate: dailyRows.at(-1)?.date ?? null,
        latestAsOf,
      },
      rows: dailyRows,
      datasetOptions: datasetOptions(iso),
    },
    rowCount: dailyRows.length,
    dataAsOf: latestAsOf,
  };
}
