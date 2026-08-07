export type PowerForecastIso = "pjm" | "ercot" | "isone" | "caiso" | "miso" | "spp" | "nyiso";
export type PowerForecastSourceMode = "pjm" | "meteologica";

export const POWER_FORECAST_ISO_TABS: Array<{
  key: PowerForecastIso;
  label: string;
  scope: string;
}> = [
  { key: "pjm", label: "PJM", scope: "Data Miner + Meteologica" },
  { key: "ercot", label: "ERCOT", scope: "Meteologica" },
  { key: "isone", label: "ISO-NE", scope: "Meteologica" },
  { key: "caiso", label: "CAISO", scope: "Meteologica" },
  { key: "miso", label: "MISO", scope: "Meteologica" },
  { key: "spp", label: "SPP", scope: "Meteologica" },
  { key: "nyiso", label: "NYISO", scope: "Meteologica" },
];

export const POWER_FORECAST_DEFAULT_NET_LOAD_AREA: Record<PowerForecastIso, string> = {
  pjm: "RTO",
  ercot: "ERCOT",
  isone: "ISONE",
  caiso: "CAISO",
  miso: "MISO",
  spp: "SPP",
  nyiso: "NYISO",
};

export function powerForecastIsoLabel(iso: PowerForecastIso): string {
  return POWER_FORECAST_ISO_TABS.find((tab) => tab.key === iso)?.label ?? iso.toUpperCase();
}

export function effectivePowerForecastSource(
  iso: PowerForecastIso,
  sourceMode: PowerForecastSourceMode,
): PowerForecastSourceMode {
  return iso === "pjm" ? sourceMode : "meteologica";
}

export function powerForecastSourceLabel(sourceMode: PowerForecastSourceMode): string {
  return sourceMode === "meteologica" ? "Meteologica" : "PJM Data Miner";
}
