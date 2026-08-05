/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const ANCILLARY_PRICE_LABELS = [
  "MAD Non-Synchronized Reserve Price",
  "MAD Secondary Reserve Price",
  "MAD Synchronized Reserve Price",
  "RTO Non-Synchronized Reserve Price",
  "RTO Regulation Capability Price",
  "RTO Regulation Mileage Price",
  "RTO Secondary Reserve Price",
  "RTO Synchronized Reserve Price",
];

function loadPowerLmpAdders(query) {
  const filename = path.join(__dirname, "powerLmpAdders.ts");
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = { exports: {} };
  const localRequire = (id) => {
    if (id === "server-only") return {};
    if (id === "@/lib/server/db") return { query };
    return require(id);
  };
  const compiled = vm.runInThisContext(Module.wrap(output), { filename });
  compiled.call(
    loadedModule.exports,
    loadedModule.exports,
    localRequire,
    loadedModule,
    filename,
    __dirname,
  );
  return loadedModule.exports;
}

test("PJM ancillary adders payload exposes config and row-shaped hourly SQL", async () => {
  const calls = [];
  const query = async (text, values) => {
    calls.push({ text, values });
    if (text.includes("max(datetime_beginning_ept::date)") && text.includes("pjm.ancillary_services")) {
      return [{ target_date: "2026-08-04" }];
    }
    if (text.includes("from pjm.ancillary_services")) {
      return [
        {
          market_date: "2026-08-04",
          metric: "RTO Regulation Mileage Price",
          hour_ending: 8,
          value: "3.5",
          as_of: "2026-08-05T01:00:00",
          source_row_count: 1,
        },
        {
          market_date: "2026-08-04",
          metric: "RTO Mileage Ratio",
          hour_ending: 8,
          value: 1.2345,
          as_of: "2026-08-05T01:00:00",
          source_row_count: 1,
        },
      ];
    }
    return [];
  };
  const mod = loadPowerLmpAdders(query);

  assert.equal(
    mod.parsePowerLmpAdderDataset("pjm-rt-ancillary-services", "pjm"),
    "pjm-rt-ancillary-services",
  );

  const result = await mod.buildPowerLmpAddersPayload({
    iso: "pjm",
    dataset: "pjm-rt-ancillary-services",
    start: "2026-08-04",
    end: "2026-08-04",
  });
  const payload = result.payload;

  assert.equal(payload.datasetLabel, "RT Ancillary");
  assert.equal(payload.sourceTable, "pjm.ancillary_services");
  assert.deepEqual(
    payload.datasetOptions.map((option) => option.dataset),
    ["pjm-da-reserve-mcp", "pjm-rt-reserve-mcp", "pjm-rt-ancillary-services"],
  );
  assert.equal(payload.metricColumns.find((metric) => metric.label === "RTO Mileage Ratio").unit, "ratio");
  assert.deepEqual(payload.defaultColumnFilters.metric, ANCILLARY_PRICE_LABELS);

  const latestCall = calls.find(
    (call) => call.text.includes("max(datetime_beginning_ept::date)") && call.text.includes("pjm.ancillary_services"),
  );
  assert.match(latestCall.text, /row_is_current = true/);

  const hourlyCall = calls.find(
    (call) =>
      call.text.includes("from pjm.ancillary_services") &&
      call.text.includes("metric.metric_label as metric"),
  );
  assert.match(hourlyCall.text, /metric\.metric_label as metric/);
  assert.match(hourlyCall.text, /MAD Non-Synchronized Reserve Price', 'MAD Non-Synchronized Reserve/);
  assert.match(hourlyCall.text, /RTO Mileage Ratio', 'RTO Mileage Ratio/);
  assert.match(hourlyCall.text, /avg\(value\)::float8/);
  assert.match(hourlyCall.text, /row_is_current = true/);
  assert.deepEqual(hourlyCall.values, [
    "2026-08-04",
    "2026-08-04",
  ]);

  const ratioRow = payload.rows.find((row) => row.dimensions.metric === "RTO Mileage Ratio");
  assert.equal(ratioRow.hourly[7], 1.23);
});

test("Power Settles adders report includes only price-unit PJM ancillary rows", async () => {
  const calls = [];
  const query = async (text, values) => {
    calls.push({ text, values });
    if (text.includes("from pjm.ancillary_services")) {
      return Array.from({ length: 24 }, (_, index) => ({
        market_date: "2026-08-04",
        metric: "RTO Regulation Mileage Price",
        hour_ending: index + 1,
        value: index + 1,
        as_of: "2026-08-05T01:00:00",
        source_row_count: 1,
      }));
    }
    return [];
  };
  const mod = loadPowerLmpAdders(query);

  const summary = await mod.buildPowerLmpAddersReportSummary({
    targetDate: "2026-08-04",
  });
  const ancillaryRows = summary.rows.filter(
    (row) => row.dataset === "pjm-rt-ancillary-services",
  );
  const completeMileagePrice = ancillaryRows.find(
    (row) => row.metricLabel === "RTO Regulation Mileage Price",
  );
  const hourlyCall = calls.find((call) => call.text.includes("from pjm.ancillary_services"));

  assert.equal(ancillaryRows.length, ANCILLARY_PRICE_LABELS.length);
  assert.ok(ancillaryRows.every((row) => row.market === "rt"));
  assert.ok(!ancillaryRows.some((row) => row.metricLabel === "RTO Mileage Ratio"));
  assert.deepEqual(
    ancillaryRows.map((row) => row.metricLabel),
    ANCILLARY_PRICE_LABELS,
  );
  assert.equal(completeMileagePrice.status, "ok");
  assert.equal(completeMileagePrice.observationCount, 24);
  assert.equal(
    completeMileagePrice.detailUrl,
    "/?section=power-lmp-adders&iso=pjm&dataset=pjm-rt-ancillary-services&date=2026-08-04&refresh=1",
  );
  assert.deepEqual(hourlyCall.values, [
    "2026-08-04",
    "2026-08-04",
  ]);
});
