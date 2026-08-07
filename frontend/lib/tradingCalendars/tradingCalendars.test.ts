import assert from "node:assert/strict";
import test from "node:test";

import {
  ICE_US_ENERGY_FUTURES_CALENDAR,
  NERC_OFF_PEAK_CALENDAR,
  classifyPjmPowerHour,
  getGasDaysPricedByIceTradeDate,
  getIceTradeDateForGasDay,
  getTradingCalendarEntry,
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

test("NERC 2026 holiday set follows the promoted six-day off-peak rule", () => {
  assert.deepEqual(
    NERC_OFF_PEAK_CALENDAR.getHolidays(2026, 2026).map((holiday) => holiday.date),
    [
      "2026-01-01",
      "2026-05-25",
      "2026-07-04",
      "2026-09-07",
      "2026-11-26",
      "2026-12-25",
    ],
  );
});

test("NERC Saturday holidays stay on Saturday and Sunday holidays observe Monday", () => {
  assert.equal(isNercHoliday("2026-07-04"), true);
  assert.equal(isNercHoliday("2026-07-03"), false);
  assert.equal(isNercHoliday("2021-07-04"), false);
  assert.equal(isNercHoliday("2021-07-05"), true);
  assert.equal(isNercOffPeakDay("2021-07-04"), true);
});

test("ICE Futures U.S. energy calendar preserves closed, modified, and open statuses", () => {
  const newYears = ICE_US_ENERGY_FUTURES_CALENDAR.getHoliday("2026-01-01");
  const mlk = ICE_US_ENERGY_FUTURES_CALENDAR.getHoliday("2026-01-19");
  const veterans = ICE_US_ENERGY_FUTURES_CALENDAR.getHoliday("2026-11-11");

  assert.equal(newYears?.tradingStatus, "closed");
  assert.equal(ICE_US_ENERGY_FUTURES_CALENDAR.isTradingDay("2026-01-01"), false);
  assert.equal(mlk?.tradingStatus, "modified");
  assert.equal(ICE_US_ENERGY_FUTURES_CALENDAR.isTradingDay("2026-01-19"), true);
  assert.equal(veterans?.tradingStatus, "open");
  assert.equal(ICE_US_ENERGY_FUTURES_CALENDAR.isTradingDay("2026-11-11"), true);
});

test("trading calendar registry exposes stable IDs and legacy NERC alias", () => {
  assert.equal(getTradingCalendarEntry("nerc-power-offpeak")?.id, "nerc-power-offpeak");
  assert.equal(getTradingCalendarEntry("nerc-off-peak-days")?.id, "nerc-power-offpeak");
  assert.equal(getTradingCalendarEntry("ice-us-energy-futures")?.calendar.calendarId, "ice-us-energy-futures");
});
