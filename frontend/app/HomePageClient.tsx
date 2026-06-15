"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import FreshnessCard from "@/components/dashboard/FreshnessCard";
import PjmDaLmps, { type PjmDaLmpsFreshnessSummary } from "@/components/pjm/PjmDaLmps";
import PjmOutages, { type PjmOutagesFreshnessSummary } from "@/components/pjm/PjmOutages";
import Sidebar, { type ActiveSection } from "@/components/Sidebar";

const DEFAULT_PJM_DA_LMPS_FRESHNESS: PjmDaLmpsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "LMP day --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const DEFAULT_PJM_OUTAGES_FRESHNESS: PjmOutagesFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Outages --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

function parseInitialSection(value: string | null): ActiveSection {
  if (value === "pjm-outages") return "pjm-outages";
  return "pjm-da-lmps";
}

function parseDateParam(value: string | null): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export default function HomePageClient() {
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<ActiveSection>(
    parseInitialSection(searchParams.get("section")),
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pjmDaLmpsRefreshToken, setPjmDaLmpsRefreshToken] = useState(0);
  const [pjmOutagesRefreshToken, setPjmOutagesRefreshToken] = useState(0);
  const [pjmDaLmpsFreshnessOpen, setPjmDaLmpsFreshnessOpen] = useState(false);
  const [pjmOutagesFreshnessOpen, setPjmOutagesFreshnessOpen] = useState(false);
  const [pjmDaLmpsFreshness, setPjmDaLmpsFreshness] =
    useState<PjmDaLmpsFreshnessSummary>(DEFAULT_PJM_DA_LMPS_FRESHNESS);
  const [pjmOutagesFreshness, setPjmOutagesFreshness] =
    useState<PjmOutagesFreshnessSummary>(DEFAULT_PJM_OUTAGES_FRESHNESS);

  const initialPjmDaLmpDate = parseDateParam(searchParams.get("date"));

  const meta = useMemo(() => {
    if (activeSection === "pjm-outages") {
      return {
        title: "Outages",
        subtitle: "PJM generation outage forecast vintages and seasonal outage overlays.",
        footer: "Outages | Source: PJM Data Miner / Azure PostgreSQL",
      };
    }
    return {
      title: "Power LMPs",
      subtitle:
        "PJM day-ahead and real-time LMPs with hourly component breakdowns and hub summaries.",
      footer: "Power LMPs | Source: Azure PostgreSQL",
    };
  }, [activeSection]);

  return (
    <div className="flex min-h-screen bg-[#0f1117] text-gray-100">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 overflow-auto">
        <main className="px-3 py-4 sm:px-8 sm:py-8">
          <div className="mb-4 flex items-center gap-3 md:hidden">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="rounded-md border border-gray-800 bg-gray-900/60 p-2 text-gray-300 hover:bg-gray-800 hover:text-white"
              aria-label="Open navigation"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              HeliosCTA
            </p>
          </div>

          <div className="mb-6 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-start md:justify-between md:gap-6">
            <div>
              <p className="mb-1 hidden text-xs font-semibold uppercase tracking-widest text-gray-500 md:block">
                HeliosCTA
              </p>
              <h1 className="text-xl font-bold text-gray-100 sm:text-3xl">{meta.title}</h1>
              <p className="mt-2 text-sm text-gray-500">{meta.subtitle}</p>
            </div>

            {activeSection === "pjm-da-lmps" && (
              <FreshnessCard
                statusLabel={pjmDaLmpsFreshness.status}
                statusClass={pjmDaLmpsFreshness.statusClass}
                summary={pjmDaLmpsFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: pjmDaLmpsFreshness.status,
                    className: pjmDaLmpsFreshness.statusClass,
                  },
                  { label: "Selected Day", value: pjmDaLmpsFreshness.targetDateLabel },
                  { label: "Latest Day", value: pjmDaLmpsFreshness.latestDateLabel },
                  { label: "Source Update", value: pjmDaLmpsFreshness.latestUpdateLabel },
                ]}
                open={pjmDaLmpsFreshnessOpen}
                onToggle={() => setPjmDaLmpsFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPjmDaLmpsRefreshToken((value) => value + 1)}
              />
            )}

            {activeSection === "pjm-outages" && (
              <FreshnessCard
                statusLabel={pjmOutagesFreshness.status}
                statusClass={pjmOutagesFreshness.statusClass}
                summary={pjmOutagesFreshness.summary}
                items={[
                  {
                    label: "Freshness Status",
                    value: pjmOutagesFreshness.status,
                    className: pjmOutagesFreshness.statusClass,
                  },
                  { label: "Region", value: pjmOutagesFreshness.targetDateLabel },
                  { label: "Latest Date", value: pjmOutagesFreshness.latestDateLabel },
                  { label: "Source Update", value: pjmOutagesFreshness.latestUpdateLabel },
                ]}
                open={pjmOutagesFreshnessOpen}
                onToggle={() => setPjmOutagesFreshnessOpen((open) => !open)}
                actionLabel="Refresh"
                onAction={() => setPjmOutagesRefreshToken((value) => value + 1)}
              />
            )}
          </div>

          {activeSection === "pjm-da-lmps" && (
            <PjmDaLmps
              initialDate={initialPjmDaLmpDate}
              refreshToken={pjmDaLmpsRefreshToken}
              onFreshnessChange={setPjmDaLmpsFreshness}
            />
          )}
          {activeSection === "pjm-outages" && (
            <PjmOutages
              refreshToken={pjmOutagesRefreshToken}
              onFreshnessChange={setPjmOutagesFreshness}
            />
          )}
          <p className="mt-6 text-center text-xs text-gray-600">{meta.footer}</p>
        </main>
      </div>
    </div>
  );
}
