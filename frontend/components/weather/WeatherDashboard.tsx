"use client";

import FreeWeatherObservations from "@/components/weather/FreeWeatherObservations";
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
    <div className="space-y-4">
      <FreeWeatherObservations refreshToken={refreshToken} />
      <WeatherHourlyTemps
        refreshToken={refreshToken}
        onFreshnessChange={onFreshnessChange}
      />
    </div>
  );
}
