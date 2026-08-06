/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { dirname, join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

function requireTypeScript(filePath) {
  const source = readFileSync(filePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  });
  const compiled = new Module(filePath, module);
  compiled.filename = filePath;
  compiled.paths = Module._nodeModulePaths(dirname(filePath));
  compiled._compile(outputText, filePath);
  return compiled.exports;
}

const {
  defaultPowerLmpGasHubForIso,
  isPowerLmpGasHubAllowedForIso,
  powerLmpGasHubOptionsForIso,
} = requireTypeScript(join(__dirname, "powerLmpHeatRate.ts"));

const pjmPowerHubGasDefaults = {
  "CHICAGO HUB": "gas_chicago",
  "N ILLINOIS HUB": "gas_chicago",
  "CHICAGO GEN HUB": "gas_chicago",
  "AEP-DAYTON HUB": "gas_tco",
  "OHIO HUB": "gas_tco",
  "AEP GEN HUB": "gas_tco",
  "ATSI GEN HUB": "gas_michcon",
  "DOMINION HUB": "gas_transco_z5_south",
  "NEW JERSEY HUB": "gas_tz6",
  "WESTERN HUB": "gas_m3",
  "EASTERN HUB": "gas_tz6",
  "WEST INT HUB": "gas_tco",
};

const ercotPowerHubGasDefaults = {
  HB_HOUSTON: "gas_hsc",
  HB_SOUTH: "gas_hsc",
  HB_WEST: "gas_waha",
  HB_NORTH: "gas_ngpl_txok",
};

test("PJM power hubs resolve to hub-specific default gas hubs", () => {
  for (const [powerHub, gasHub] of Object.entries(pjmPowerHubGasDefaults)) {
    assert.equal(defaultPowerLmpGasHubForIso("pjm", powerHub), gasHub);
  }
});

test("unknown PJM power hubs fall back to Tetco M3", () => {
  assert.equal(defaultPowerLmpGasHubForIso("pjm"), "gas_m3");
  assert.equal(defaultPowerLmpGasHubForIso("pjm", "UNKNOWN HUB"), "gas_m3");
});

test("PJM allows every mapped gas hub, including MichCon", () => {
  const mappedGasHubs = new Set(Object.values(pjmPowerHubGasDefaults));
  const optionKeys = powerLmpGasHubOptionsForIso("pjm").map((hub) => hub.key);

  for (const gasHub of mappedGasHubs) {
    assert.equal(isPowerLmpGasHubAllowedForIso("pjm", gasHub), true);
    assert.equal(optionKeys.includes(gasHub), true);
  }
});

test("ERCOT power hubs resolve to evidence-backed default gas hubs", () => {
  for (const [powerHub, gasHub] of Object.entries(ercotPowerHubGasDefaults)) {
    assert.equal(defaultPowerLmpGasHubForIso("ercot", powerHub), gasHub);
  }
});

test("unknown ERCOT power hubs fall back to Houston Ship Channel", () => {
  assert.equal(defaultPowerLmpGasHubForIso("ercot"), "gas_hsc");
  assert.equal(defaultPowerLmpGasHubForIso("ercot", "UNKNOWN HUB"), "gas_hsc");
});

test("ERCOT allows every mapped default gas hub", () => {
  const mappedGasHubs = new Set(Object.values(ercotPowerHubGasDefaults));
  const optionKeys = powerLmpGasHubOptionsForIso("ercot").map((hub) => hub.key);

  for (const gasHub of mappedGasHubs) {
    assert.equal(isPowerLmpGasHubAllowedForIso("ercot", gasHub), true);
    assert.equal(optionKeys.includes(gasHub), true);
  }
});
