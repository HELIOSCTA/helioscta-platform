"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fetchJsonWithCache } from "@/lib/clientJsonCache";

type ReportType = "MADIS HF" | "METAR";

interface NwsLatestObservation {
  stationId: string;
  timestamp: string | null;
  tempF: number | null;
  dewPointF: number | null;
  windDirectionDeg: number | null;
  windSpeedMph: number | null;
  windGustMph: number | null;
  rawMessage: string | null;
  textDescription: string | null;
  error?: string;
}

interface IemObservationRow {
  station: string;
  stationId: string;
  valid: string;
  lon: number | null;
  lat: number | null;
  tmpf: number | null;
  dwpf: number | null;
  relh: number | null;
  sknt: number | null;
  gust: number | null;
  drct: number | null;
  p01i: number | null;
  alti: number | null;
  mslp: number | null;
  vsby: number | null;
  wxcodes: string | null;
  metar: string | null;
  reportType: ReportType;
}

interface MrmsProduct {
  product: string;
  url: string;
  latestModified: string | null;
  sizeBytes: number | null;
  available: boolean;
  error?: string;
}

interface FreeWeatherPayload {
  source: "NOAA_NWS+IEM_ASOS+NOAA_MRMS";
  filters: {
    stations: string[];
    hours: number;
  };
  asOf: {
    iem: string | null;
    nws: string | null;
    mrms: string | null;
  };
  nwsLatest: NwsLatestObservation[];
  iemRows: IemObservationRow[];
  mrmsProducts: MrmsProduct[];
  rowCounts: {
    iemRows: number;
    nwsStations: number;
    mrmsProducts: number;
  };
}

interface ChartRow {
  time: string;
  label: string;
  tempF: number | null;
  dewPointF: number | null;
  windKt: number | null;
  gustKt: number | null;
  humidityPct: number | null;
}

const DEFAULT_STATIONS = "KORD,KCMH,KPIT,KPHL,KEWR,KBWI,KDCA,KRDU";
const API_CACHE_TTL_MS = 60 * 1000;
const HOURS = [3, 6, 12, 24];

function compactStationList(value: string): string[] {
  const seen = new Set<string>();
  for (const part of value.split(",")) {
    const station = part.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!station) continue;
    seen.add(station.length === 3 ? `K${station}` : station);
    if (seen.size >= 16) break;
  }
  return Array.from(seen);
}

function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function fmtTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function fmtFileSize(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  if (value >= 1_048_576) return `${fmtNumber(value / 1_048_576, 1)} MB`;
  return `${fmtNumber(value / 1024, 0)} KB`;
}

function sourceClass(reportType: ReportType): string {
  return reportType === "MADIS HF"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
    : "border-sky-500/30 bg-sky-500/10 text-sky-200";
}

function productLabel(product: string): string {
  return product
    .replace("MergedReflectivityQCComposite", "Reflectivity QC")
    .replace("ReflectivityAtLowestAltitude", "Lowest Reflectivity")
    .replace("MergedAzShear_0-2kmAGL", "Az Shear 0-2 km")
    .replace("NLDN_CG_005min_AvgDensity", "Lightning 5 min");
}

function latestRowsByStation(rows: IemObservationRow[]): Map<string, IemObservationRow> {
  const latest = new Map<string, IemObservationRow>();
  for (const row of rows) {
    const existing = latest.get(row.stationId);
    if (!existing || row.valid > existing.valid) latest.set(row.stationId, row);
  }
  return latest;
}

function latestNwsByStation(rows: NwsLatestObservation[]): Map<string, NwsLatestObservation> {
  return new Map(rows.map((row) => [row.stationId, row]));
}

function buildApiUrl(stations: string[], hours: number, refresh: boolean): string {
  const params = new URLSearchParams({
    stations: stations.join(","),
    hours: String(hours),
  });
  if (refresh) params.set("refresh", "1");
  return `/api/weather/free-observations?${params.toString()}`;
}

function buildCacheKey(stations: string[], hours: number): string {
  return ["api:weather-free-observations", stations.join("|"), hours].join(":");
}

export default function FreeWeatherObservations({
  refreshToken = 0,
}: {
  refreshToken?: number;
}) {
  const [stationsInput, setStationsInput] = useState(DEFAULT_STATIONS);
  const [stations, setStations] = useState(() => compactStationList(DEFAULT_STATIONS));
  const [hours, setHours] = useState(6);
  const [activeStation, setActiveStation] = useState(stations[0] ?? "KORD");
  const [payload, setPayload] = useState<FreeWeatherPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualRefreshToken, setManualRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const forceRefresh = refreshToken > 0 || manualRefreshToken > 0;
    const url = buildApiUrl(stations, hours, forceRefresh);
    const key = buildCacheKey(stations, hours);
    setLoading(true);
    setError(null);

    fetchJsonWithCache<FreeWeatherPayload>({
      key,
      url,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
    })
      .then((nextPayload) => {
        setPayload(nextPayload);
        const stationSet = new Set(nextPayload.filters.stations);
        setActiveStation((current) =>
          stationSet.has(current) ? current : nextPayload.filters.stations[0] ?? "KORD",
        );
      })
      .catch((nextError: unknown) => {
        if (controller.signal.aborted) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to fetch observations");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [hours, manualRefreshToken, refreshToken, stations]);

  const latestIem = useMemo(
    () => latestRowsByStation(payload?.iemRows ?? []),
    [payload?.iemRows],
  );
  const latestNws = useMemo(
    () => latestNwsByStation(payload?.nwsLatest ?? []),
    [payload?.nwsLatest],
  );
  const stationOptions = payload?.filters.stations ?? stations;
  const chartRows = useMemo<ChartRow[]>(
    () =>
      (payload?.iemRows ?? [])
        .filter((row) => row.stationId === activeStation)
        .map((row) => ({
          time: row.valid,
          label: fmtTime(row.valid),
          tempF: row.tmpf,
          dewPointF: row.dwpf,
          windKt: row.sknt,
          gustKt: row.gust,
          humidityPct: row.relh,
        })),
    [activeStation, payload?.iemRows],
  );
  const recentRows = useMemo(
    () => [...(payload?.iemRows ?? [])].reverse().slice(0, 120),
    [payload?.iemRows],
  );

  const applyStations = () => {
    const parsed = compactStationList(stationsInput);
    if (!parsed.length) return;
    setStations(parsed);
    setActiveStation(parsed[0]);
  };

  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Free Weather Observations</h2>
          <p className="mt-1 text-xs text-gray-500">
            NOAA NWS, IEM ASOS/MADIS, and NOAA MRMS latest products
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
          <span>IEM {fmtDateTime(payload?.asOf.iem)}</span>
          <span>NWS {fmtDateTime(payload?.asOf.nws)}</span>
          <span>MRMS {fmtDateTime(payload?.asOf.mrms)}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Stations
          </span>
          <input
            value={stationsInput}
            onChange={(event) => setStationsInput(event.target.value)}
            className="w-[420px] max-w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Hours
          </span>
          <select
            value={hours}
            onChange={(event) => setHours(Number(event.target.value))}
            className="w-24 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
          >
            {HOURS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={applyStations}
          className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-200 hover:border-gray-600 hover:bg-gray-800"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => setManualRefreshToken((value) => value + 1)}
          className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100 hover:border-sky-400/60"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && !payload ? (
        <div className="mt-4 rounded-md border border-gray-800 bg-gray-950/40 p-5 text-sm text-gray-500">
          Loading free weather observations...
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {stationOptions.map((station) => {
              const nws = latestNws.get(station);
              const iem = latestIem.get(station);
              return (
                <button
                  key={station}
                  type="button"
                  onClick={() => setActiveStation(station)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    activeStation === station
                      ? "border-sky-500/50 bg-sky-500/10"
                      : "border-gray-800 bg-gray-950/30 hover:border-gray-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-100">{station}</span>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                        iem ? sourceClass(iem.reportType) : "border-gray-700 bg-gray-900 text-gray-500"
                      }`}
                    >
                      {iem?.reportType ?? "No IEM"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-gray-600">Temp</p>
                      <p className="font-semibold text-gray-100">{fmtNumber(nws?.tempF, 1)} F</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Dew</p>
                      <p className="font-semibold text-gray-100">{fmtNumber(nws?.dewPointF, 1)} F</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Wind</p>
                      <p className="font-semibold text-gray-100">
                        {fmtNumber(nws?.windSpeedMph, 0)} mph
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Gust</p>
                      <p className="font-semibold text-gray-100">
                        {fmtNumber(nws?.windGustMph, 0)} mph
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 truncate text-[11px] text-gray-500" title={nws?.rawMessage ?? ""}>
                    {nws?.error ?? nws?.rawMessage ?? "No latest NWS message"}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-lg border border-gray-800 bg-gray-950/30 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-gray-100">
                    {activeStation} Recent Trend
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {chartRows.length.toLocaleString()} IEM rows
                  </p>
                </div>
                <select
                  value={activeStation}
                  onChange={(event) => setActiveStation(event.target.value)}
                  className="w-40 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                >
                  {stationOptions.map((station) => (
                    <option key={station} value={station}>
                      {station}
                    </option>
                  ))}
                </select>
              </div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartRows} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#9ca3af", fontSize: 10 }}
                      axisLine={{ stroke: "#374151" }}
                      tickLine={{ stroke: "#374151" }}
                    />
                    <YAxis
                      yAxisId="temp"
                      tick={{ fill: "#9ca3af", fontSize: 10 }}
                      axisLine={{ stroke: "#374151" }}
                      tickLine={{ stroke: "#374151" }}
                    />
                    <YAxis
                      yAxisId="wind"
                      orientation="right"
                      tick={{ fill: "#9ca3af", fontSize: 10 }}
                      axisLine={{ stroke: "#374151" }}
                      tickLine={{ stroke: "#374151" }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #374151",
                        borderRadius: 8,
                        color: "#e5e7eb",
                      }}
                      labelFormatter={(_, rows) => fmtDateTime(rows[0]?.payload?.time)}
                    />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="tempF"
                      name="Temp F"
                      stroke="#f97316"
                      dot={false}
                      connectNulls
                    />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="dewPointF"
                      name="Dew F"
                      stroke="#38bdf8"
                      dot={false}
                      connectNulls
                    />
                    <Line
                      yAxisId="wind"
                      type="monotone"
                      dataKey="windKt"
                      name="Wind kt"
                      stroke="#facc15"
                      dot={false}
                      connectNulls
                    />
                    <Line
                      yAxisId="wind"
                      type="monotone"
                      dataKey="gustKt"
                      name="Gust kt"
                      stroke="#ef4444"
                      dot={false}
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-lg border border-gray-800 bg-gray-950/30 p-3">
              <h3 className="text-sm font-semibold text-gray-100">MRMS Latest</h3>
              <div className="mt-3 space-y-2">
                {(payload?.mrmsProducts ?? []).map((product) => (
                  <div key={product.product} className="rounded-md border border-gray-800 bg-[#0d1119] p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-gray-100">
                        {productLabel(product.product)}
                      </span>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                          product.available
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                            : "border-red-500/30 bg-red-500/10 text-red-200"
                        }`}
                      >
                        {product.available ? "Available" : "Missing"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                      <span>{fmtDateTime(product.latestModified)}</span>
                      <span>{fmtFileSize(product.sizeBytes)}</span>
                    </div>
                    <a
                      href={product.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex rounded-md border border-gray-700 px-2 py-1 text-[11px] font-semibold text-gray-300 hover:border-gray-600 hover:bg-gray-900"
                    >
                      Open GRIB2
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-gray-800 bg-[#0d1119]">
            <table className="w-full min-w-[960px] border-collapse text-xs text-gray-200">
              <thead className="bg-gray-950 text-[10px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="border border-gray-800 px-2 py-2 text-left">Time</th>
                  <th className="border border-gray-800 px-2 py-2 text-left">Station</th>
                  <th className="border border-gray-800 px-2 py-2 text-right">Temp F</th>
                  <th className="border border-gray-800 px-2 py-2 text-right">Dew F</th>
                  <th className="border border-gray-800 px-2 py-2 text-right">RH</th>
                  <th className="border border-gray-800 px-2 py-2 text-right">Wind kt</th>
                  <th className="border border-gray-800 px-2 py-2 text-right">Gust kt</th>
                  <th className="border border-gray-800 px-2 py-2 text-right">Dir</th>
                  <th className="border border-gray-800 px-2 py-2 text-right">Precip</th>
                  <th className="border border-gray-800 px-2 py-2 text-left">METAR</th>
                </tr>
              </thead>
              <tbody>
                {recentRows.map((row) => (
                  <tr key={`${row.stationId}-${row.valid}-${row.metar ?? ""}`} className="odd:bg-gray-950/20">
                    <td className="border border-gray-800 px-2 py-1 tabular-nums text-gray-400">
                      {fmtDateTime(row.valid)}
                    </td>
                    <td className="border border-gray-800 px-2 py-1">
                      <span className="font-semibold text-gray-100">{row.stationId}</span>
                      <span className={`ml-2 rounded-md border px-1.5 py-0.5 text-[10px] ${sourceClass(row.reportType)}`}>
                        {row.reportType}
                      </span>
                    </td>
                    <td className="border border-gray-800 px-2 py-1 text-right tabular-nums">
                      {fmtNumber(row.tmpf, 1)}
                    </td>
                    <td className="border border-gray-800 px-2 py-1 text-right tabular-nums">
                      {fmtNumber(row.dwpf, 1)}
                    </td>
                    <td className="border border-gray-800 px-2 py-1 text-right tabular-nums">
                      {fmtNumber(row.relh, 0)}
                    </td>
                    <td className="border border-gray-800 px-2 py-1 text-right tabular-nums">
                      {fmtNumber(row.sknt, 0)}
                    </td>
                    <td className="border border-gray-800 px-2 py-1 text-right tabular-nums">
                      {fmtNumber(row.gust, 0)}
                    </td>
                    <td className="border border-gray-800 px-2 py-1 text-right tabular-nums">
                      {fmtNumber(row.drct, 0)}
                    </td>
                    <td className="border border-gray-800 px-2 py-1 text-right tabular-nums">
                      {fmtNumber(row.p01i, 2)}
                    </td>
                    <td className="max-w-[360px] truncate border border-gray-800 px-2 py-1 text-gray-500" title={row.metar ?? ""}>
                      {row.metar ?? "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
