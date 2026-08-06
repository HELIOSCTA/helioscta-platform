export type PowerLmpMetricMode = "price" | "heat-rate" | "spark-spread";

export type PowerLmpHeatRateIso =
  | "pjm"
  | "ercot"
  | "isone"
  | "caiso"
  | "miso"
  | "spp"
  | "nyiso";

export type PowerLmpGasHubKey =
  | "gas_henry_hub"
  | "gas_transco_station_85"
  | "gas_tgp_500l"
  | "gas_fgt_zone_3"
  | "gas_columbia_gulf_mainline"
  | "gas_anr_se"
  | "gas_pine_prairie"
  | "gas_tetco_wla"
  | "gas_hsc"
  | "gas_waha"
  | "gas_ngpl_txok"
  | "gas_algonquin"
  | "gas_m3"
  | "gas_transco_z5_south"
  | "gas_transco_z5_north"
  | "gas_iroquois_z2"
  | "gas_tz6"
  | "gas_dom_south"
  | "gas_tco"
  | "gas_tetco_m2"
  | "gas_tenn_z4"
  | "gas_transco_leidy"
  | "gas_nng_ventura"
  | "gas_chicago"
  | "gas_socal_citygate"
  | "gas_pge_citygate"
  | "gas_cig_mainline"
  | "gas_ngpl_midcon"
  | "gas_michcon";

export type PjmHeatRateGasHubKey = PowerLmpGasHubKey;

export interface PowerLmpGasHubConfig {
  key: PowerLmpGasHubKey;
  label: string;
  symbol: string;
  sqlColumn: string;
  region: "east" | "midwest" | "mountain" | "pacific" | "south_central";
  metadataStatus: "ice_product_url_verified" | "unverified_legacy_symbol";
  reviewStatus: "verified_cash" | "legacy_cash_requires_business_mapping_review";
}

export type PjmHeatRateGasHubConfig = PowerLmpGasHubConfig;

export const DEFAULT_POWER_LMP_METRIC_MODE: PowerLmpMetricMode = "price";
export const DEFAULT_POWER_LMP_GAS_HUB: PowerLmpGasHubKey = "gas_m3";
export const DEFAULT_PJM_HEAT_RATE_GAS_HUB: PjmHeatRateGasHubKey =
  DEFAULT_POWER_LMP_GAS_HUB;
export const DEFAULT_POWER_LMP_SPARK_HEAT_RATE = 7.0;
export const MIN_POWER_LMP_SPARK_HEAT_RATE = 4.0;
export const MAX_POWER_LMP_SPARK_HEAT_RATE = 20.0;

export const POWER_LMP_GAS_HUBS: PowerLmpGasHubConfig[] = [
  {
    key: "gas_henry_hub",
    label: "Henry Hub",
    symbol: "XGF D1-IPG",
    sqlColumn: "gas_henry_hub",
    region: "south_central",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_transco_station_85",
    label: "Transco Station 85",
    symbol: "XVA D1-IPG",
    sqlColumn: "gas_transco_station_85",
    region: "south_central",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_tgp_500l",
    label: "TGP-500L",
    symbol: "XLM D1-IPG",
    sqlColumn: "gas_tgp_500l",
    region: "south_central",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_fgt_zone_3",
    label: "FGT Zone 3",
    symbol: "YHV D1-IPG",
    sqlColumn: "gas_fgt_zone_3",
    region: "east",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_columbia_gulf_mainline",
    label: "Columbia Gulf Mainline",
    symbol: "XLA D1-IPG",
    sqlColumn: "gas_columbia_gulf_mainline",
    region: "south_central",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_anr_se",
    label: "ANR SE-T",
    symbol: "XTA D1-IPG",
    sqlColumn: "gas_anr_se",
    region: "south_central",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_pine_prairie",
    label: "Pine Prairie",
    symbol: "YV7 D1-IPG",
    sqlColumn: "gas_pine_prairie",
    region: "south_central",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_tetco_wla",
    label: "Tetco WLA",
    symbol: "XVM D1-IPG",
    sqlColumn: "gas_tetco_wla",
    region: "south_central",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_hsc",
    label: "Houston Ship Channel",
    symbol: "XYZ D1-IPG",
    sqlColumn: "gas_hsc",
    region: "south_central",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_waha",
    label: "Waha",
    symbol: "XT6 D1-IPG",
    sqlColumn: "gas_waha",
    region: "south_central",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_ngpl_txok",
    label: "NGPL TX/OK",
    symbol: "XIT D1-IPG",
    sqlColumn: "gas_ngpl_txok",
    region: "south_central",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_algonquin",
    label: "Algonquin Citygates",
    symbol: "X7F D1-IPG",
    sqlColumn: "gas_algonquin",
    region: "east",
    metadataStatus: "unverified_legacy_symbol",
    reviewStatus: "legacy_cash_requires_business_mapping_review",
  },
  {
    key: "gas_m3",
    label: "Tetco M3",
    symbol: "XZR D1-IPG",
    sqlColumn: "gas_m3",
    region: "east",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_transco_z5_south",
    label: "Transco Z5 South",
    symbol: "YFF D1-IPG",
    sqlColumn: "gas_transco_z5_south",
    region: "east",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_transco_z5_north",
    label: "Transco Z5 North",
    symbol: "Z2Y D1-IPG",
    sqlColumn: "gas_transco_z5_north",
    region: "east",
    metadataStatus: "unverified_legacy_symbol",
    reviewStatus: "legacy_cash_requires_business_mapping_review",
  },
  {
    key: "gas_iroquois_z2",
    label: "Iroquois Zone 2",
    symbol: "YP8 D1-IPG",
    sqlColumn: "gas_iroquois_z2",
    region: "east",
    metadataStatus: "unverified_legacy_symbol",
    reviewStatus: "legacy_cash_requires_business_mapping_review",
  },
  {
    key: "gas_tz6",
    label: "Transco Z6 NY",
    symbol: "XWK D1-IPG",
    sqlColumn: "gas_tz6",
    region: "east",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_dom_south",
    label: "Dominion South",
    symbol: "XJL D1-IPG",
    sqlColumn: "gas_dom_south",
    region: "east",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_tco",
    label: "Columbia TCO",
    symbol: "XIZ D1-IPG",
    sqlColumn: "gas_tco",
    region: "east",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_tetco_m2",
    label: "Tetco M2",
    symbol: "YAG D1-IPG",
    sqlColumn: "gas_tetco_m2",
    region: "east",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_tenn_z4",
    label: "Tennessee Z4 Marcellus",
    symbol: "Z1Q D1-IPG",
    sqlColumn: "gas_tenn_z4",
    region: "east",
    metadataStatus: "unverified_legacy_symbol",
    reviewStatus: "legacy_cash_requires_business_mapping_review",
  },
  {
    key: "gas_transco_leidy",
    label: "Transco Leidy",
    symbol: "YQE D1-IPG",
    sqlColumn: "gas_transco_leidy",
    region: "east",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_nng_ventura",
    label: "Northern Ventura",
    symbol: "XTG D1-IPG",
    sqlColumn: "gas_nng_ventura",
    region: "midwest",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_chicago",
    label: "Chicago Citygate",
    symbol: "YHF D1-IPG",
    sqlColumn: "gas_chicago",
    region: "midwest",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_socal_citygate",
    label: "SoCal Citygate",
    symbol: "XKF D1-IPG",
    sqlColumn: "gas_socal_citygate",
    region: "pacific",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_pge_citygate",
    label: "PG&E Citygate",
    symbol: "XGV D1-IPG",
    sqlColumn: "gas_pge_citygate",
    region: "pacific",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_cig_mainline",
    label: "CIG Mainline",
    symbol: "YKL D1-IPG",
    sqlColumn: "gas_cig_mainline",
    region: "mountain",
    metadataStatus: "unverified_legacy_symbol",
    reviewStatus: "legacy_cash_requires_business_mapping_review",
  },
  {
    key: "gas_ngpl_midcon",
    label: "NGPL Midcontinent",
    symbol: "XJR D1-IPG",
    sqlColumn: "gas_ngpl_midcon",
    region: "south_central",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
  {
    key: "gas_michcon",
    label: "MichCon",
    symbol: "XJZ D1-IPG",
    sqlColumn: "gas_michcon",
    region: "midwest",
    metadataStatus: "ice_product_url_verified",
    reviewStatus: "verified_cash",
  },
];

const PJM_HEAT_RATE_GAS_HUB_KEYS: PowerLmpGasHubKey[] = [
  "gas_m3",
  "gas_dom_south",
  "gas_tco",
  "gas_tz6",
  "gas_henry_hub",
  "gas_tetco_m2",
  "gas_transco_z5_south",
  "gas_transco_z5_north",
  "gas_tenn_z4",
  "gas_transco_leidy",
  "gas_chicago",
  "gas_michcon",
];

export const PJM_HEAT_RATE_GAS_HUBS: PjmHeatRateGasHubConfig[] =
  POWER_LMP_GAS_HUBS.filter((hub) => PJM_HEAT_RATE_GAS_HUB_KEYS.includes(hub.key));

export const POWER_LMP_GAS_HUBS_BY_ISO: Record<
  PowerLmpHeatRateIso,
  PowerLmpGasHubKey[]
> = {
  pjm: PJM_HEAT_RATE_GAS_HUB_KEYS,
  ercot: ["gas_hsc", "gas_waha", "gas_ngpl_txok", "gas_henry_hub"],
  isone: ["gas_algonquin", "gas_iroquois_z2", "gas_tz6"],
  caiso: ["gas_socal_citygate", "gas_pge_citygate"],
  miso: [
    "gas_chicago",
    "gas_michcon",
    "gas_nng_ventura",
    "gas_ngpl_midcon",
    "gas_henry_hub",
    "gas_hsc",
    "gas_waha",
    "gas_ngpl_txok",
    "gas_columbia_gulf_mainline",
    "gas_anr_se",
    "gas_pine_prairie",
    "gas_tetco_wla",
  ],
  spp: ["gas_ngpl_midcon", "gas_ngpl_txok", "gas_waha", "gas_cig_mainline"],
  nyiso: ["gas_tz6", "gas_iroquois_z2", "gas_algonquin", "gas_m3", "gas_tco"],
};

export const POWER_LMP_DEFAULT_GAS_HUB_BY_ISO: Record<
  PowerLmpHeatRateIso,
  PowerLmpGasHubKey
> = {
  pjm: "gas_m3",
  ercot: "gas_hsc",
  isone: "gas_algonquin",
  caiso: "gas_socal_citygate",
  miso: "gas_chicago",
  spp: "gas_ngpl_midcon",
  nyiso: "gas_tz6",
};

export const POWER_LMP_GAS_HUB_BY_POWER_HUB: Partial<
  Record<PowerLmpHeatRateIso, Record<string, PowerLmpGasHubKey>>
> = {
  pjm: {
    "CHICAGO HUB": "gas_chicago",
    "N ILLINOIS HUB": "gas_chicago",
    "CHICAGO GEN HUB": "gas_chicago",
    "AEP-DAYTON HUB": "gas_tco",
    "OHIO HUB": "gas_tco",
    "AEP GEN HUB": "gas_tco",
    "ATSI GEN HUB": "gas_michcon",
    "DOMINION HUB": "gas_transco_z5_south",
    "NEW JERSEY HUB": "gas_tz6",
    "WESTERN HUB": "gas_m3",
    "EASTERN HUB": "gas_tz6",
    "WEST INT HUB": "gas_tco",
  },
  ercot: {
    HB_NORTH: "gas_ngpl_txok",
    HB_SOUTH: "gas_hsc",
    HB_WEST: "gas_waha",
    HB_HOUSTON: "gas_hsc",
  },
  isone: {
    ".H.INTERNAL_HUB": "gas_algonquin",
  },
  caiso: {
    "TH_SP15_GEN-APND": "gas_socal_citygate",
    "TH_NP15_GEN-APND": "gas_pge_citygate",
  },
  miso: {
    "INDIANA.HUB": "gas_chicago",
    "ARKANSAS.HUB": "gas_ngpl_midcon",
    "ILLINOIS.HUB": "gas_chicago",
    "LOUISIANA.HUB": "gas_henry_hub",
    "MICHIGAN.HUB": "gas_michcon",
    "MINN.HUB": "gas_nng_ventura",
    "TEXAS.HUB": "gas_hsc",
  },
  spp: {
    SPPNORTH_HUB: "gas_ngpl_midcon",
    SPPSOUTH_HUB: "gas_ngpl_txok",
  },
  nyiso: {
    WEST: "gas_iroquois_z2",
    GENESE: "gas_iroquois_z2",
    CENTRL: "gas_iroquois_z2",
    NORTH: "gas_iroquois_z2",
    "MHK VL": "gas_iroquois_z2",
    CAPITL: "gas_iroquois_z2",
    "HUD VL": "gas_tz6",
    MILLWD: "gas_tz6",
    DUNWOD: "gas_tz6",
    "N.Y.C.": "gas_tz6",
    LONGIL: "gas_tz6",
  },
};

export function parsePowerLmpMetricMode(
  value: string | null | undefined,
): PowerLmpMetricMode {
  if (value === "heat-rate" || value === "spark-spread") return value;
  return DEFAULT_POWER_LMP_METRIC_MODE;
}

export function normalizePowerLmpSparkHeatRate(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_POWER_LMP_SPARK_HEAT_RATE;
  const bounded = Math.min(
    Math.max(value, MIN_POWER_LMP_SPARK_HEAT_RATE),
    MAX_POWER_LMP_SPARK_HEAT_RATE,
  );
  return Math.round(bounded * 10) / 10;
}

export function parsePowerLmpSparkHeatRate(
  value: string | number | null | undefined,
): number {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_POWER_LMP_SPARK_HEAT_RATE;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return normalizePowerLmpSparkHeatRate(parsed);
}

export function powerLmpGasHubConfig(
  key: PowerLmpGasHubKey,
): PowerLmpGasHubConfig {
  return (
    POWER_LMP_GAS_HUBS.find((hub) => hub.key === key) ??
    POWER_LMP_GAS_HUBS.find((hub) => hub.key === DEFAULT_POWER_LMP_GAS_HUB) ??
    POWER_LMP_GAS_HUBS[0]
  );
}

export function pjmHeatRateGasHubConfig(
  key: PjmHeatRateGasHubKey,
): PjmHeatRateGasHubConfig {
  return powerLmpGasHubConfig(key);
}

export function parsePowerLmpGasHubKey(
  value: string | null | undefined,
): PowerLmpGasHubKey | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;

  return (
    POWER_LMP_GAS_HUBS.find(
      (hub) =>
        hub.key.toLowerCase() === normalized ||
        hub.label.toLowerCase() === normalized ||
        hub.symbol.toLowerCase() === normalized,
    )?.key ?? null
  );
}

export function parsePjmHeatRateGasHubKey(
  value: string | null | undefined,
): PjmHeatRateGasHubKey {
  return parsePowerLmpGasHubKey(value) ?? DEFAULT_PJM_HEAT_RATE_GAS_HUB;
}

export function defaultPowerLmpGasHubForIso(
  iso: PowerLmpHeatRateIso,
  powerHub?: string | null,
): PowerLmpGasHubKey {
  const mapped = powerHub ? POWER_LMP_GAS_HUB_BY_POWER_HUB[iso]?.[powerHub] : null;
  return mapped ?? POWER_LMP_DEFAULT_GAS_HUB_BY_ISO[iso];
}

export function isPowerLmpGasHubAllowedForIso(
  iso: PowerLmpHeatRateIso,
  gasHub: PowerLmpGasHubKey,
): boolean {
  return POWER_LMP_GAS_HUBS_BY_ISO[iso].includes(gasHub);
}

export function powerLmpGasHubOptionsForIso(
  iso: PowerLmpHeatRateIso,
): PowerLmpGasHubConfig[] {
  const keys = new Set(POWER_LMP_GAS_HUBS_BY_ISO[iso]);
  return POWER_LMP_GAS_HUBS.filter((hub) => keys.has(hub.key));
}
