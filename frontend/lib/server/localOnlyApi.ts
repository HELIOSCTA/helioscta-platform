import "server-only";

import { NextResponse } from "next/server";
import type { ObservedRouteResult } from "@/lib/server/apiObservability";

export function localOnlyObservedNotFound(): ObservedRouteResult {
  return {
    payload: { error: "Not found" },
    status: 404,
    rowCount: 0,
    dataAsOf: null,
    headers: { "Cache-Control": "no-store" },
  };
}

export function localOnlyNextNotFound(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
