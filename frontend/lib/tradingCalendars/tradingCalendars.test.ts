import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPjmPowerHour,
  getGasDaysPricedByIceTradeDate,
  getIceTradeDateForGasDay,
  isNercHoliday,
  isNercOffPeakDay,
} from "./index";

test("ICE physical gas calendar maps July 2026 observed holiday strip", () => {
  assert.deepEqual(getGasDaysPricedByIceTradeDate("2026-07-02"), [
    "2026-07-03",
    "2026-07-04",
    "2026-07-05",
    "2026-07-06",
  ]);
  assert.equal(getIceTradeDateForGasDay("2026-07-06"), "2026-07-02");
});

test("ICE physical gas calendar maps a normal Friday weekend strip", () => {
  assert.deepEqual(getGasDaysPricedByIceTradeDate("2026-06-26"), [
    "2026-06-27",
    "2026-06-28",
    "2026-06-29",
  ]);
  assert.equal(getIceTradeDateForGasDay("2026-06-29"), "2026-06-26");
});

test("ICE physical gas calendar maps Thanksgiving and Day After Thanksgiving as one strip", () => {
  assert.deepEqual(getGasDaysPricedByIceTradeDate("2026-11-25"), [
    "2026-11-26",
    "2026-11-27",
    "2026-11-28",
    "2026-11-29",
    "2026-11-30",
  ]);
  assert.equal(getIceTradeDateForGasDay("2026-11-27"), "2026-11-25");
  assert.equal(getIceTradeDateForGasDay("2026-11-30"), "2026-11-25");
});

test("PJM power helper classifies NERC off-peak holidays", () => {
  assert.equal(isNercOffPeakDay("2026-07-04"), true);
  assert.equal(isNercHoliday("2026-07-04"), true);
  assert.equal(classifyPjmPowerHour("2026-07-04", 8), "offpeak");
  assert.equal(classifyPjmPowerHour("2026-07-03", 8), "onpeak");
  assert.equal(classifyPjmPowerHour("2026-07-06", 8), "onpeak");
});
