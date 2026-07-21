"use client";

import WeatherHourlyTemps, { type WeatherFreshnessSummary } from "@/components/weather/WeatherHourlyTemps";

export type WeatherDashboardFreshnessSummary = WeatherFreshnessSummary;

export default function WeatherDashboard({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: WeatherDashboardFreshnessSummary) => void;
}) {
  return (
    <WeatherHourlyTemps
      refreshToken={refreshToken}
      onFreshnessChange={onFreshnessChange}
    />
  );
}
