"use client";

import { useEffect, useMemo } from "react";

export interface GtnPipelineBalanceFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
  diagnosticLabel: string;
}

interface GtnPipelineBalanceProps {
  initialDate?: string;
  refreshToken?: number;
  onFreshnessChange?: (freshness: GtnPipelineBalanceFreshnessSummary) => void;
}

const DEFAULT_REPORT_DATE = "2026-07-27";

function reportFreshness(reportDate: string): GtnPipelineBalanceFreshnessSummary {
  return {
    status: "Replica",
    statusClass: "border-sky-500/40 bg-sky-500/10 text-sky-100",
    summary: `Research Viewer GTN Pipeline Balance ${reportDate}`,
    targetDateLabel: reportDate,
    latestDateLabel: reportDate,
    latestUpdateLabel: "Local Research Viewer HTML",
    diagnosticLabel: "Static report replica",
  };
}

export default function GtnPipelineBalance({
  initialDate,
  refreshToken = 0,
  onFreshnessChange,
}: GtnPipelineBalanceProps) {
  const reportDate = initialDate ?? DEFAULT_REPORT_DATE;

  useEffect(() => {
    onFreshnessChange?.(reportFreshness(reportDate));
  }, [onFreshnessChange, reportDate]);

  const src = useMemo(() => {
    const params = new URLSearchParams({ date: reportDate });
    if (refreshToken) params.set("refresh", String(refreshToken));
    return `/api/criterion/gtn-pipeline-balance/research-viewer?${params.toString()}`;
  }, [refreshToken, reportDate]);

  return (
    <div className="h-screen min-h-[900px] w-full overflow-hidden bg-white text-black">
      <iframe
        key={src}
        title={`Research Viewer - GTN Pipeline Balance - ${reportDate}`}
        src={src}
        className="h-full w-full border-0 bg-white"
      />
    </div>
  );
}
