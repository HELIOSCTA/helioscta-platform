"use client";

import { useState } from "react";

export type ActiveSection =
  | "pjm-da-lmps"
  | "pjm-outages";

interface SidebarProps {
  activeSection: ActiveSection;
  onSectionChange: (section: ActiveSection) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface NavItem {
  id: ActiveSection;
  label: string;
  group?: string;
  disabled?: boolean;
  comingSoon?: boolean;
}

interface TopSection {
  key: string;
  label: string;
  navItems: NavItem[];
}

function getSections(): TopSection[] {
  return [
    {
      key: "power",
      label: "POWER",
      navItems: [
        { id: "pjm-da-lmps", label: "LMPs" },
        { id: "pjm-outages", label: "Outages" },
      ],
    },
  ];
}

export default function Sidebar({
  activeSection,
  onSectionChange,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const topSections = getSections();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(topSections.map((s) => [s.key, true]))
  );

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSectionChange = (section: ActiveSection) => {
    onSectionChange(section);
    onMobileClose?.();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={onMobileClose}
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[300px] shrink-0 flex-col border-r border-gray-800 bg-[#0b0d14] transition-transform md:static md:w-[280px] md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <div>
          <p className="text-sm font-bold tracking-[0.18em] text-gray-100">
            HELIOSCTA
          </p>
        </div>
        <button
          onClick={onMobileClose}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-200 md:hidden"
          aria-label="Close navigation"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="mx-3 h-px bg-gray-800" />

      {/* Collapsible Sections */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {topSections.map((section) => {
          const isExpanded = expandedSections[section.key] ?? true;
          return (
            <div key={section.key}>
              {/* Section header toggle */}
              <button
                onClick={() => toggleSection(section.key)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-gray-800/30"
              >
                <span className="text-xs font-bold text-white">
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

              {/* Nav items */}
              {isExpanded && (
                <div className="mt-0.5 space-y-0.5 pb-1">
                  {section.navItems.map((item, itemIndex) => {
                    const isActive = activeSection === item.id;
                    const previousGroup = section.navItems[itemIndex - 1]?.group;
                    const showGroupLabel = item.group && item.group !== previousGroup;
                    return (
                      <div key={item.id}>
                        {showGroupLabel && (
                          <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                            {item.group}
                          </div>
                        )}
                        <button
                          onClick={() => !item.disabled && handleSectionChange(item.id)}
                          disabled={item.disabled}
                          title={item.disabled ? `${item.label} is not available yet` : undefined}
                          className={`flex w-full items-center rounded-md py-2 text-[13px] font-medium transition-colors md:py-1.5 ${
                            item.disabled
                              ? "cursor-not-allowed bg-transparent text-gray-600 opacity-55"
                              : isActive
                                ? "bg-gray-800/60 text-white"
                                : "text-gray-400 hover:bg-gray-800/40 hover:text-gray-200"
                          } ${item.group ? "px-5" : "px-3"}`}
                        >
                          <span className="whitespace-nowrap">{item.label}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-800 px-4 py-3">
        <p className="text-[10px] text-gray-600">Source: Azure PostgreSQL</p>
      </div>
      </aside>
    </>
  );
}
