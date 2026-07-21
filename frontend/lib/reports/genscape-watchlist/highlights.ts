export function heatBg(value: number, min: number, max: number): string {
  if (max === min) return "transparent";
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (ratio >= 0.5) {
    const intensity = (ratio - 0.5) * 2;
    return `rgba(34, 197, 94, ${(0.15 + intensity * 0.55).toFixed(2)})`;
  }
  const intensity = (0.5 - ratio) * 2;
  return `rgba(239, 68, 68, ${(0.15 + intensity * 0.55).toFixed(2)})`;
}

export function changeTextClass(value: number | null): string {
  if (value == null) return "text-gray-600";
  if (value > 0) return "text-green-400";
  if (value < 0) return "text-red-400";
  return "text-gray-500";
}

export function changeTextColor(value: number | null): string {
  if (value == null) return "#64748b";
  if (value > 0) return "#16a34a";
  if (value < 0) return "#dc2626";
  return "#64748b";
}

export function changeLabel(value: number | null, formatted: string): string {
  if (value == null) return "--";
  return value > 0 ? `+${formatted}` : formatted;
}
