import "server-only";

import type {
  PositionsHomeValidationScope,
  PositionsHomeStatus,
  PositionsHomeValidationCheck,
  PositionsHomeValidationSeverity,
} from "@/lib/positionsAndTrades/positionsHomeTypes";

interface ValidationDefinition {
  scope: PositionsHomeValidationScope;
  scopeLabel: string;
  checkId: string;
  label: string;
  sourceSystem: string;
  severity: PositionsHomeValidationSeverity;
}

const VALIDATION_DEFINITIONS: ValidationDefinition[] = [
  {
    scope: "latest",
    scopeLabel: "Latest Files",
    checkId: "clear_street_latest_product_matching",
    label: "Clear Street Latest Product Matching",
    sourceSystem: "Clear Street",
    severity: "error",
  },
  {
    scope: "latest",
    scopeLabel: "Latest Files",
    checkId: "clear_street_latest_vendor_codes_by_exchange_route",
    label: "Clear Street Latest Vendor Codes By Exchange Route",
    sourceSystem: "Clear Street",
    severity: "warn",
  },
  {
    scope: "latest",
    scopeLabel: "Latest Files",
    checkId: "nav_latest_product_matching",
    label: "NAV Latest Product Matching",
    sourceSystem: "NAV",
    severity: "error",
  },
  {
    scope: "latest",
    scopeLabel: "Latest Files",
    checkId: "nav_latest_vendor_codes_by_exchange_route",
    label: "NAV Latest Vendor Codes By Exchange Route",
    sourceSystem: "NAV",
    severity: "warn",
  },
  {
    scope: "all_history",
    scopeLabel: "All History",
    checkId: "clear_street_all_history_product_matching",
    label: "Clear Street All-History Product Matching",
    sourceSystem: "Clear Street",
    severity: "error",
  },
  {
    scope: "all_history",
    scopeLabel: "All History",
    checkId: "clear_street_all_history_vendor_codes_by_exchange_route",
    label: "Clear Street All-History Vendor Codes By Exchange Route",
    sourceSystem: "Clear Street",
    severity: "warn",
  },
  {
    scope: "all_history",
    scopeLabel: "All History",
    checkId: "nav_all_history_product_matching",
    label: "NAV All-History Product Matching",
    sourceSystem: "NAV",
    severity: "error",
  },
  {
    scope: "all_history",
    scopeLabel: "All History",
    checkId: "nav_all_history_vendor_codes_by_exchange_route",
    label: "NAV All-History Vendor Codes By Exchange Route",
    sourceSystem: "NAV",
    severity: "warn",
  },
];

function staticValidationCheck({
  definition,
  status,
  statusLabel,
  detail,
}: {
  definition: ValidationDefinition;
  status: PositionsHomeStatus;
  statusLabel: string;
  detail: string;
}): PositionsHomeValidationCheck {
  return {
    scope: definition.scope,
    scopeLabel: definition.scopeLabel,
    checkId: definition.checkId,
    label: definition.label,
    sourceSystem: definition.sourceSystem,
    severity: definition.severity,
    status,
    statusLabel,
    failingCount: null,
    failingCountLabel: "--",
    detail,
    sampleProductCode: null,
    sampleProductGrouping: null,
    sampleRouteFamily: null,
    sampleFailureReason: null,
    sampleGroupCount: null,
    firstObservedDate: null,
    lastObservedDate: null,
  };
}

export function deferredPositionsHomeValidationChecks(): PositionsHomeValidationCheck[] {
  return VALIDATION_DEFINITIONS.map((definition) =>
    staticValidationCheck({
      definition,
      status: "not_applicable",
      statusLabel: "Deferred",
      detail:
        "Model validation is intentionally loaded from the cached validation endpoint.",
    }),
  );
}
