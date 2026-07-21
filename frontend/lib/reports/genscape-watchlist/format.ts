import type { NomRow, ReportColumn } from "./types";

export function fmtDate(ts: string | null): string {
  if (!ts) return "--";
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtNum(val: number | null | undefined): string {
  if (val == null) return "--";
  return Number(val).toLocaleString();
}

export function fmtDateShort(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function lookbackDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function fmtPivotDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function getWeekFriday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day <= 5 ? 5 - day : 6;
  const fri = new Date(d);
  fri.setDate(fri.getDate() + diff);
  return fri.toISOString().slice(0, 10);
}

export function formatIsoDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

export function formatNumber(value: unknown): string {
  if (value == null || value === "") return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return parsed.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function formatReportCell(row: NomRow, column: ReportColumn): string {
  const value = row[column.key];
  if (column.dataType === "date") return fmtDate(value == null ? null : String(value));
  if (column.dataType === "number") return fmtNum(value as number | null | undefined);
  if (column.key === "latitude" || column.key === "longitude") {
    return value != null ? Number(value).toFixed(4) : "--";
  }
  return value == null ? "--" : String(value);
}

export function formatEmailCell(row: NomRow, column: ReportColumn): string {
  const value = row[column.key];
  if (column.dataType === "date") return formatIsoDate(value);
  if (column.dataType === "number") return formatNumber(value);
  return value == null ? "" : String(value);
}

export function escapeCsv(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows: NomRow[], columns: ReportColumn[]): string {
  const header = columns.map((column) => escapeCsv(column.label)).join(",");
  const body = rows.map((row) =>
    columns.map((column) => escapeCsv(formatEmailCell(row, column))).join(",")
  );
  return ["\uFEFF" + header, ...body].join("\n");
}

export function safeFileToken(value: string): string {
  const token = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return token || "watchlist";
}

export function normalizeDate(value: string | undefined, fallback: Date): string {
  if (!value) return fallback.toISOString().slice(0, 10);
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return parsed.toISOString().slice(0, 10);
}

export function defaultStartDate(days = 60): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}
