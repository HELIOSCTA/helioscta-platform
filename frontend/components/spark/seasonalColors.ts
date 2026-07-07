export const SEASONAL_CONTRACT_YEAR_COLORS: Record<number, string> = {
  2020: "#f43f5e",
  2021: "#14b8a6",
  2022: "#eab308",
  2023: "#94a3b8",
  2024: "#60a5fa",
  2025: "#34d399",
  2026: "#f97316",
  2027: "#a78bfa",
  2028: "#ec4899",
  2029: "#22d3ee",
};

const OLDER_YEAR_FALLBACK_COLORS = ["#fb7185", "#2dd4bf", "#facc15", "#c084fc", "#38bdf8"];
const FUTURE_YEAR_FALLBACK_COLORS = ["#84cc16", "#f59e0b", "#818cf8", "#10b981", "#e879f9"];

export function seasonalYearColor(year: number): string {
  const exactColor = SEASONAL_CONTRACT_YEAR_COLORS[year];
  if (exactColor) return exactColor;

  const anchoredYears = Object.keys(SEASONAL_CONTRACT_YEAR_COLORS).map(Number);
  const minYear = Math.min(...anchoredYears);
  const maxYear = Math.max(...anchoredYears);

  if (year < minYear) {
    return OLDER_YEAR_FALLBACK_COLORS[(minYear - year - 1) % OLDER_YEAR_FALLBACK_COLORS.length];
  }

  return FUTURE_YEAR_FALLBACK_COLORS[(year - maxYear - 1) % FUTURE_YEAR_FALLBACK_COLORS.length];
}
