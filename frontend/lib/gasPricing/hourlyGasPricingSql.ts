import {
  buildIcePhysicalGasNonTradingDaysValuesSql,
  getIcePhysicalGasCalendarYearRange,
} from "../tradingCalendars";

export type GasPriceBasis =
  | "settlement"
  | "open"
  | "high"
  | "low"
  | "close"
  | "vwap_close";

export interface HourlyGasPricingSqlParams {
  startGasDay?: string | null;
  endGasDay?: string | null;
  priceBasis?: GasPriceBasis | null;
}

export interface GasPricingSqlDownload {
  group: "Marts";
  label: string;
  fileName: string;
  relativePath: string;
  sql: string;
}

export interface GasHubColumn {
  symbol: string;
  columnName: string;
  label: string;
  promotedRegistryAvailable: boolean;
}

export interface IcePythonNextDayGasHourlyRow {
  timezone: string;
  datetime_beginning_local: string;
  datetime_ending_local: string;
  gas_day: string;
  trade_date: string;
  tetco_m3_cash: number | null;
  columbia_tco_cash: number | null;
  transco_z6_ny_cash: number | null;
  dominion_south_cash: number | null;
  nng_ventura_cash: number | null;
  tetco_m2_cash: number | null;
  transco_z5_north_cash: number | null;
  tenn_z4_marcellus_cash: number | null;
  transco_leidy_cash: number | null;
  chicago_cg_cash: number | null;
  tenn_z5_cash: number | null;
  rex_e_midw_cash: number | null;
  anr_sw_cash: number | null;
  panhandle_cash: number | null;
}

export const PJM_NEXT_DAY_GAS_HUB_COLUMNS: GasHubColumn[] = [
  {
    symbol: "XZR D1-IPG",
    columnName: "tetco_m3_cash",
    label: "TETCO M3",
    promotedRegistryAvailable: true,
  },
  {
    symbol: "XIZ D1-IPG",
    columnName: "columbia_tco_cash",
    label: "Columbia TCO",
    promotedRegistryAvailable: true,
  },
  {
    symbol: "XWK D1-IPG",
    columnName: "transco_z6_ny_cash",
    label: "Transco Z6 NY",
    promotedRegistryAvailable: true,
  },
  {
    symbol: "XJL D1-IPG",
    columnName: "dominion_south_cash",
    label: "Dominion South",
    promotedRegistryAvailable: true,
  },
  {
    symbol: "XTG D1-IPG",
    columnName: "nng_ventura_cash",
    label: "NNG Ventura",
    promotedRegistryAvailable: true,
  },
  {
    symbol: "YAG D1-IPG",
    columnName: "tetco_m2_cash",
    label: "TETCO M2",
    promotedRegistryAvailable: true,
  },
  {
    symbol: "Z2Y D1-IPG",
    columnName: "transco_z5_north_cash",
    label: "Transco Z5 North",
    promotedRegistryAvailable: true,
  },
  {
    symbol: "Z1Q D1-IPG",
    columnName: "tenn_z4_marcellus_cash",
    label: "Tennessee Z4 Marcellus",
    promotedRegistryAvailable: true,
  },
  {
    symbol: "YQE D1-IPG",
    columnName: "transco_leidy_cash",
    label: "Transco Leidy",
    promotedRegistryAvailable: true,
  },
  {
    symbol: "YHF D1-IPG",
    columnName: "chicago_cg_cash",
    label: "Chicago Citygate",
    promotedRegistryAvailable: true,
  },
  {
    symbol: "Z28 D1-IPG",
    columnName: "tenn_z5_cash",
    label: "Tennessee Z5",
    promotedRegistryAvailable: false,
  },
  {
    symbol: "YVQ D1-IPG",
    columnName: "rex_e_midw_cash",
    label: "REX E Midw",
    promotedRegistryAvailable: false,
  },
  {
    symbol: "XZL D1-IPG",
    columnName: "anr_sw_cash",
    label: "ANR SW",
    promotedRegistryAvailable: false,
  },
  {
    symbol: "XIH D1-IPG",
    columnName: "panhandle_cash",
    label: "Panhandle",
    promotedRegistryAvailable: false,
  },
];

const PRICE_BASIS_VALUES = new Set<GasPriceBasis>([
  "settlement",
  "open",
  "high",
  "low",
  "close",
  "vwap_close",
]);

function sqlText(value: string | null | undefined): string {
  return value === null || value === undefined
    ? "NULL"
    : `'${value.replaceAll("'", "''")}'`;
}

function sqlDate(value: string | null | undefined): string {
  return `${sqlText(value)}::date`;
}

function nullableDateValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizePriceBasis(value: GasPriceBasis | null | undefined): GasPriceBasis {
  if (!value) return "vwap_close";
  return PRICE_BASIS_VALUES.has(value) ? value : "vwap_close";
}

function valuesRows(rows: string[][]): string {
  return rows.map((row) => `    (${row.join(", ")})`).join(",\n");
}

function gasHubValues(): string {
  return valuesRows(
    PJM_NEXT_DAY_GAS_HUB_COLUMNS.map((hub) => [
      sqlText(hub.symbol),
      sqlText(hub.columnName),
      sqlText(hub.label),
      hub.promotedRegistryAvailable ? "TRUE" : "FALSE",
    ])
  );
}

function icePhysicalGasNonTradingDaysValues(
  startGasDay: string,
  endGasDay: string | null
): string {
  const { startYear, endYear } = getIcePhysicalGasCalendarYearRange(startGasDay, endGasDay);
  return buildIcePhysicalGasNonTradingDaysValuesSql(startYear, endYear);
}

function pivotColumns(): string {
  return PJM_NEXT_DAY_GAS_HUB_COLUMNS.map(
    (hub) =>
      `    MAX(f.price_value) FILTER (WHERE f.price_column = '${hub.columnName}') AS ${hub.columnName}`
  ).join(",\n");
}

function finalColumns(): string {
  return [
    "timezone",
    "datetime_beginning_local",
    "datetime_ending_local",
    "gas_day",
    "trade_date",
    ...PJM_NEXT_DAY_GAS_HUB_COLUMNS.map((hub) => hub.columnName),
  ]
    .map((column) => `    ${column}`)
    .join(",\n");
}

function generatedSql(sql: string): string {
  return `-- Generated from frontend/lib/gasPricing/hourlyGasPricingSql.ts.
-- Calendar rules: frontend/lib/tradingCalendars/calendars/icePhysicalGas.ts.
-- Source table: ice_python.settlements.
-- Grain: one row per gas-day hour, using 09:00-09:00 America/Chicago gas days.
-- Default price basis: vwap_close.
-- Edit the params CTE for manual date or price-basis checks.

${sql.trim()}
`;
}

export function buildIcePythonNextDayGasHourlySql(
  params: HourlyGasPricingSqlParams = {}
): string {
  const startGasDay = nullableDateValue(params.startGasDay) ?? "2020-01-01";
  const endGasDay = nullableDateValue(params.endGasDay);
  const priceBasis = normalizePriceBasis(params.priceBasis);

  return generatedSql(`with params as (
  select
    ${sqlDate(startGasDay)} as start_gas_day,
    ${sqlDate(endGasDay)} as end_gas_day,
    ${sqlText(priceBasis)}::text as price_basis
),
non_trading_days as (
${icePhysicalGasNonTradingDaysValues(startGasDay, endGasDay)}
),
hub_registry as (
  select *
  from (
    values
${gasHubValues()}
  ) as t(
    symbol,
    price_column,
    hub_label,
    promoted_registry_available
  )
),
source_prices as (
  select
    s.trade_date::date as trade_date,
    h.price_column,
    avg(
      case params.price_basis
        when 'settlement' then s.settlement
        when 'open' then s.open
        when 'high' then s.high
        when 'low' then s.low
        when 'close' then s.close
        when 'vwap_close' then s.vwap_close
        else s.vwap_close
      end
    )::double precision as price_value
  from ice_python.settlements s
  inner join hub_registry h
    on h.symbol = s.symbol
  cross join params
  group by s.trade_date::date, h.price_column
),
max_source_trade_date as (
  select max(trade_date) as trade_date
  from source_prices
),
date_bounds as (
  select
    (least(params.start_gas_day, coalesce(min(source_prices.trade_date), params.start_gas_day)) - interval '10 days')::date as start_date,
    (
      greatest(
        coalesce(params.end_gas_day, current_date + interval '2 years'),
        coalesce(max(source_prices.trade_date), params.start_gas_day)
      ) + interval '10 days'
    )::date as end_date
  from params
  left join source_prices
    on true
  group by params.start_gas_day, params.end_gas_day
),
date_spine as (
  select generate_series(start_date, end_date, interval '1 day')::date as calendar_date
  from date_bounds
),
trading_days as (
  select calendar_date as trade_date
  from date_spine
  where extract(dow from calendar_date) between 1 and 5
    and calendar_date not in (select non_trading_date from non_trading_days)
),
sessions as (
  select
    trade_date,
    lead(trade_date) over (order by trade_date) as next_trade_date
  from trading_days
),
aligned_prices as (
  select
    td.trade_date,
    h.price_column,
    p.price_value
  from trading_days td
  cross join hub_registry h
  left join source_prices p
    on p.trade_date = td.trade_date
   and p.price_column = h.price_column
),
grouped_prices as (
  select
    trade_date,
    price_column,
    price_value,
    count(price_value) over (
      partition by price_column
      order by trade_date
      rows between unbounded preceding and current row
    ) as price_group
  from aligned_prices
),
filled_prices as (
  select
    trade_date,
    price_column,
    max(price_value) over (
      partition by price_column, price_group
    )::double precision as price_value
  from grouped_prices
),
gas_day_trade_dates as (
  select
    s.trade_date,
    gas_day::date as gas_day
  from sessions s
  cross join lateral generate_series(
    (s.trade_date + interval '1 day')::date,
    coalesce(
      s.next_trade_date,
      case
        when extract(dow from s.trade_date) = 5
          then (s.trade_date + interval '3 days')::date
        else (s.trade_date + interval '1 day')::date
      end
    )::date,
    interval '1 day'
  ) as gas_day
),
hours as (
  select generate_series(1, 24) as hour_ending
),
hourly_spine as (
  select
    (
      (
        g.gas_day
        + time '09:00:00'
        + ((h.hour_ending - 1) * interval '1 hour')
      ) at time zone 'America/Chicago' at time zone 'UTC'
    ) as datetime_beginning_utc,
    (
      (
        g.gas_day
        + time '09:00:00'
        + (h.hour_ending * interval '1 hour')
      ) at time zone 'America/Chicago' at time zone 'UTC'
    ) as datetime_ending_utc,
    'America/Chicago'::text as timezone,
    (
      g.gas_day
      + time '09:00:00'
      + ((h.hour_ending - 1) * interval '1 hour')
    ) as datetime_beginning_local,
    (
      g.gas_day
      + time '09:00:00'
      + (h.hour_ending * interval '1 hour')
    ) as datetime_ending_local,
    g.gas_day,
    h.hour_ending::integer as hour_ending,
    g.trade_date
  from gas_day_trade_dates g
  cross join hours h
  cross join params
  cross join max_source_trade_date
  where g.gas_day >= params.start_gas_day
    and (params.end_gas_day is null or g.gas_day <= params.end_gas_day)
    and max_source_trade_date.trade_date is not null
    and g.trade_date <= max_source_trade_date.trade_date
),
hourly_prices as (
  select
    s.timezone,
    s.datetime_beginning_local,
    s.datetime_ending_local,
    s.gas_day,
    s.trade_date,
${pivotColumns()}
  from hourly_spine s
  left join filled_prices f
    on f.trade_date = s.trade_date
  group by
    s.timezone,
    s.datetime_beginning_local,
    s.datetime_ending_local,
    s.gas_day,
    s.trade_date
),
final as (
  select
${finalColumns()}
  from hourly_prices
)
select *
from final
order by datetime_beginning_local desc;`);
}

export function buildGasPricingSqlDownloads(
  params: HourlyGasPricingSqlParams = {}
): GasPricingSqlDownload[] {
  return [
    {
      group: "Marts",
      label: "ICE Next-Day Gas Hourly",
      fileName: "ice_python_next_day_gas_hourly.sql",
      relativePath: "marts/ice_python_next_day_gas_hourly.sql",
      sql: buildIcePythonNextDayGasHourlySql(params),
    },
  ];
}
