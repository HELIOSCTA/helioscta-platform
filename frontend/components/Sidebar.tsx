"use client";

import { useEffect, useState } from "react";

export type ActiveSection =
  | "power-settles-dashboard"
  | "pjm-da-lmps"
  | "power-lmp-adders"
  | "pjm-term-bible"
  | "pjm-historical-settlements"
  | "backoffice-home"
  | "backoffice-positions-trades"
  | "backoffice-monitor"
  | "backoffice-trade-pipeline"
  | "backoffice-nav-daily-position-sheet"
  | "positions-home"
  | "nav-positions"
  | "clear-street-trades"
  | "ice-trade-blotter"
  | "ice-settlements"
  | "spark-spreads"
  | "map"
  | "noms"
  | "gtn-balance"
  | "ice-pmi-curve"
  | "gas-prices"
  | "gas-outright"
  | "salts"
  | "pjm-price-duration-curves"
  | "pjm-price-distributions"
  | "eia-generation"
  | "pjm-generation"
  | "pjm-tightness-lookback"
  | "pjm-ops-summary"
  | "pjm-load-growth"
  | "pjm-forecasts"
  | "pjm-outages"
  | "pjm-weather"
  | "pjm-da-model"
  | "weather-short-term";

interface SidebarProps {
  activeSection: ActiveSection;
  onSectionChange: (section: ActiveSection) => void;
  showLocalDevFeatures: boolean;
}

interface NavItem {
  id?: ActiveSection;
  key?: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface TopSection {
  key: string;
  label: string;
  navItems: NavItem[];
}

function isItemActive(item: NavItem, activeSection: ActiveSection): boolean {
  if (!item.id) return false;
  if (item.id === activeSection) return true;
  if (item.id === "pjm-historical-settlements" && activeSection === "pjm-term-bible") {
    return true;
  }
  return false;
}

function getSections(showLocalDevFeatures: boolean): TopSection[] {
  const sections: TopSection[] = [];

  sections.push({
    key: "pricing",
    label: "Pricing",
    navItems: [
      { id: "ice-settlements", label: "Power ICE Settles" },
      { id: "spark-spreads", label: "Power Sparks" },
      { id: "gas-prices", label: "Gas ICE Settles" },
      { id: "gas-outright", label: "Gas Outright" },
    ],
  });

  sections.push({
    key: "power",
    label: "Power",
    navItems: [
      { id: "pjm-da-lmps", label: "LMPs" },
      { id: "power-lmp-adders", label: "LMP Adders" },
      { id: "pjm-historical-settlements", label: "Historical Settlements" },
      { id: "pjm-ops-summary", label: "Ops Sum" },
      { id: "pjm-outages", label: "Outages" },
      { id: "pjm-forecasts", label: "Forecasts" },
      { id: "pjm-load-growth", label: "Load Growth" },
      { id: "eia-generation", label: "EIA Dashboard", description: "EIA-930 fuel mix + gas burn" },
    ],
  });

  sections.push({
    key: "back-office",
    label: "Back Office",
    navItems: [
      {
        id: "backoffice-home",
        label: "Positions & Trades",
        description: "Home + NAV + MAREX monitor",
      },
      { id: "backoffice-monitor", label: "Monitor", description: "Access + feed status" },
      { id: "backoffice-trade-pipeline", label: "Trade Pipeline", description: "Clear Street -> MUFG worker spine" },
      { id: "ice-trade-blotter", label: "Trade Blotter", description: "Clear Street + raw ICE rows" },
      { id: "backoffice-nav-daily-position-sheet", label: "NAV Daily Position Sheet", description: "Gas + power NAV matrix" },
    ],
  });

  if (showLocalDevFeatures) {
    sections.push({
      key: "dev",
      label: "DEV",
      navItems: [
        { id: "pjm-da-model", label: "PJM DA Model", description: "Meteo baseline DA forecast staging" },
        { id: "power-settles-dashboard", label: "Power Settles", description: "DA / RT / DART by ISO" },
        { id: "map", label: "Gas RT" },
        { id: "noms", label: "Gas Noms" },
        { id: "gtn-balance", label: "GTN Balance" },
        { id: "salts", label: "Salt Model" },
        { id: "pjm-generation", label: "PJM Generation" },
        { id: "pjm-weather", label: "Weather" },
        { id: "weather-short-term", label: "Short-Term Weather" },
        { id: "positions-home", label: "Old Positions Home" },
        { id: "nav-positions", label: "Old NAV Positions" },
        { id: "clear-street-trades", label: "Old Clear Street Trades" },
      ],
    });
  }

  return sections;
}

export default function Sidebar({
  activeSection,
  onSectionChange,
  showLocalDevFeatures,
}: SidebarProps) {
  const topSections = getSections(showLocalDevFeatures);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(topSections.map((s) => [s.key, s.key !== "dev"]))
  );

  useEffect(() => {
    const activeTopSection = getSections(showLocalDevFeatures).find((section) =>
      section.navItems.some((item) => isItemActive(item, activeSection)),
    );
    if (!activeTopSection) return;
    setExpandedSections((current) =>
      current[activeTopSection.key] ? current : { ...current, [activeTopSection.key]: true },
    );
  }, [activeSection, showLocalDevFeatures]);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSectionChange = (section: ActiveSection | undefined) => {
    if (!section) return;
    onSectionChange(section);
  };

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-gray-800 bg-[#0b0d14] md:w-[208px] md:border-b-0 md:border-r">
      <div className="border-b border-gray-800 px-4 py-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">
          HELIOS CTA
        </p>
        <p className="mt-0.5 text-sm font-semibold text-gray-200">Energy Markets</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {topSections.map((section) => {
          const isExpanded = expandedSections[section.key] ?? true;
          return (
            <div key={section.key} className="mb-1">
              <button
                onClick={() => toggleSection(section.key)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-gray-800/50"
              >
                <span className="flex-1 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                  {section.label}
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-3 w-3 text-gray-600 transition-transform ${isExpanded ? "rotate-0" : "-rotate-90"}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExpanded && (
                <div className="ml-1 mt-0.5 space-y-0.5 pb-1">
                  {section.navItems.map((item) => {
                    const isActive = isItemActive(item, activeSection);
                    const itemKey = item.id ?? item.key ?? item.label;
                    return (
                      <button
                        key={itemKey}
                        onClick={() => !item.disabled && handleSectionChange(item.id)}
                        disabled={item.disabled}
                        title={item.disabled ? `${item.label} is not available yet` : undefined}
                        className={`w-full rounded-lg border px-3 py-2.5 text-left transition-all duration-100 ${
                          item.disabled
                            ? "cursor-not-allowed border-transparent"
                            : isActive
                              ? "border-gray-600/50 bg-gray-700/50"
                              : "border-transparent hover:bg-gray-800/50"
                        }`}
                      >
                        <span
                          className={`block text-[13px] font-semibold leading-tight ${
                            item.disabled
                              ? "text-gray-400"
                              : isActive
                                ? "text-gray-100"
                                : "text-gray-400"
                          }`}
                        >
                          {item.label}
                        </span>
                        {item.description && (
                          <span className="mt-0.5 block text-[11px] leading-tight text-gray-600">
                            {item.description}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-gray-800 px-4 py-3">
        <p className="text-[10px] text-gray-700">Source: Azure PostgreSQL</p>
      </div>
    </aside>
  );
}
