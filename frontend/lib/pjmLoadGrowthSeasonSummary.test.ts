import assert from "node:assert/strict";
import test from "node:test";

import { resolvePowerSeasonWindow } from "./pjmLoadGrowthSeasonSummary";

test("current season resolves to Summer 2026 STTD on August 7, 2026", () => {
  const window = resolvePowerSeasonWindow("current", "2026-08-07");

  assert.equal(window.requestedSeason, "current");
  assert.equal(window.season, "summer");
  assert.equal(window.label, "Summer 2026 STTD");
  assert.equal(window.currentStart, "2026-06-01");
  assert.equal(window.currentEnd, "2026-08-06");
  assert.equal(window.currentEndExclusive, "2026-08-07");
  assert.equal(window.lastYearStart, "2025-06-01");
  assert.equal(window.lastYearEnd, "2025-08-06");
  assert.equal(window.lastYearEndExclusive, "2025-08-07");
});

test("current winter season crosses calendar years", () => {
  const window = resolvePowerSeasonWindow("current", "2026-02-10");

  assert.equal(window.season, "winter");
  assert.equal(window.label, "Winter 2025/26 STTD");
  assert.equal(window.currentStart, "2025-11-01");
  assert.equal(window.currentEnd, "2026-02-09");
  assert.equal(window.lastYearStart, "2024-11-01");
  assert.equal(window.lastYearEnd, "2025-02-09");
});

test("explicit winter selects the latest completed winter after March", () => {
  const window = resolvePowerSeasonWindow("winter", "2026-08-07");

  assert.equal(window.season, "winter");
  assert.equal(window.label, "Winter 2025/26");
  assert.equal(window.currentStart, "2025-11-01");
  assert.equal(window.currentEnd, "2026-03-31");
  assert.equal(window.lastYearStart, "2024-11-01");
  assert.equal(window.lastYearEnd, "2025-03-31");
});
