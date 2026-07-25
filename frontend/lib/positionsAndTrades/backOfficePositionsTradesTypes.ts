export type BackOfficePositionsTradesCommodity = "both" | "natural_gas" | "power";
export type BackOfficePositionsTradesInstrument = "both" | "fixed_price" | "options";
export type BackOfficePositionsTradesMark = "live" | "settlement";

export interface BackOfficePositionsTradesAvailableDate {
  navDate: string;
  rowCount: number;
  latestUploadAt: string | null;
}

export interface BackOfficePositionsTradesColumn {
  key: string;
  label: string;
  type: "daily" | "monthly";
}

export interface BackOfficePositionsTradesRow {
  product: string;
  commodity: "Natural Gas" | "Power";
  instrument: "Fixed Price" | "Options";
  values: Record<string, number>;
  total: number;
}

export interface BackOfficePositionsTradesPayload {
  source: "backoffice-positions-trades";
  generatedAt: string;
  selectedDate: string | null;
  latestDate: string | null;
  asOfLabel: string;
  availableDates: BackOfficePositionsTradesAvailableDate[];
  accounts: string[];
  filters: {
    account: string;
    commodity: BackOfficePositionsTradesCommodity;
    instrument: BackOfficePositionsTradesInstrument;
    mark: BackOfficePositionsTradesMark;
  };
  columns: BackOfficePositionsTradesColumn[];
  rows: BackOfficePositionsTradesRow[];
  rowCount: number;
  sourceRowCount: number;
  liveLabel: string;
  sourceChecks: string;
}
