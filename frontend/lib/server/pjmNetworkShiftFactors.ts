import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  PjmConstraintBranchMatchStatus,
  PjmConstraintShiftDirection,
  PjmConstraintShiftFactorModelSummary,
} from "@/lib/pjmConstraintShiftFactorsTypes";

export interface WesternHubBusWeight {
  busPnodeName: string;
  busPnodeFactor: number;
}

export interface ConstraintShiftEstimate {
  shiftFactor: number | null;
  absoluteShiftFactor: number | null;
  estimatedWesternHubImpact: number | null;
  direction: PjmConstraintShiftDirection;
  matchStatus: PjmConstraintBranchMatchStatus;
  matchConfidence: number;
  matchedBranchKey: string | null;
  matchedBranchName: string | null;
  fromBusNumber: number | null;
  fromBusName: string | null;
  toBusNumber: number | null;
  toBusName: string | null;
  circuitId: string | null;
}

export type RawBranchNeighborhoodRelation = "same_branch" | "shared_bus" | "nearby_raw";

export interface RawBranchNeighborhoodScore {
  relation: RawBranchNeighborhoodRelation | null;
  score: number;
  hopDistance: number | null;
  sharedBusNumber: number | null;
}

interface RawBus {
  number: number;
  name: string;
  normalizedName: string;
  baseKv: number;
}

interface RawBranch {
  index: number;
  key: string;
  fromBusNumber: number;
  toBusNumber: number;
  circuitId: string;
  x: number;
  susceptance: number;
  fromBus: RawBus;
  toBus: RawBus;
  name: string;
  normalizedName: string;
  shiftFactor: number;
}

interface ParsedRawNetwork {
  buses: RawBus[];
  branches: Omit<RawBranch, "shiftFactor">[];
}

interface SolvedNetwork {
  summary: PjmConstraintShiftFactorModelSummary;
  branches: RawBranch[];
  branchCandidateIndex: Map<string, RawBranch[]>;
  branchByKey: Map<string, RawBranch>;
  busAdjacency: Map<number, number[]>;
}

interface ModelResult {
  summary: PjmConstraintShiftFactorModelSummary;
  estimateForFacility: (
    monitoredFacility: string,
    averageShadowPrice: number,
  ) => ConstraintShiftEstimate;
  scoreBranchNeighborhood: (
    sourceBranchKey: string | null | undefined,
    targetBranchKey: string | null | undefined,
  ) => RawBranchNeighborhoodScore | null;
}

interface CacheEntry {
  key: string;
  result: ModelResult;
}

const RAW_FILE_NAME = "pjm_network_model.raw";
const DEFAULT_RAW_PATH = path.join(process.cwd(), "data", RAW_FILE_NAME);
const SOLVE_TOLERANCE = 1e-8;
const SOLVE_MAX_ITERATIONS = 4_000;
const MIN_BRANCH_MATCH_CONFIDENCE = 0.5;

let cachedModel: CacheEntry | null = null;

export async function loadPjmShiftFactorModel(
  westernHubBuses: WesternHubBusWeight[],
  rawPath = DEFAULT_RAW_PATH,
): Promise<ModelResult> {
  let stat;
  try {
    stat = await fs.stat(rawPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return unavailableModel({
        status: "model_missing",
        statusMessage: `Model file missing: ${path.relative(process.cwd(), rawPath)}`,
        rawPath,
        westernHubBusCount: westernHubBuses.length,
      });
    }
    return unavailableModel({
      status: "model_error",
      statusMessage: error instanceof Error ? error.message : "Unable to read model file.",
      rawPath,
      westernHubBusCount: westernHubBuses.length,
    });
  }

  const hubKey = westernHubBuses
    .map((row) => `${row.busPnodeName}:${row.busPnodeFactor}`)
    .join("|");
  const cacheKey = `${rawPath}:${stat.size}:${stat.mtimeMs}:${hubKey}`;
  if (cachedModel?.key === cacheKey) return cachedModel.result;

  try {
    const text = await fs.readFile(rawPath, "utf8");
    const parsed = parseRawNetwork(text);
    const solved = solveWesternHubShiftFactors(parsed, westernHubBuses, {
      rawPath,
      rawFileSizeBytes: stat.size,
      rawFileUpdatedAt: stat.mtime.toISOString(),
    });
    const result: ModelResult = {
      summary: solved.summary,
      estimateForFacility: (monitoredFacility, averageShadowPrice) =>
        estimateForFacility(solved, monitoredFacility, averageShadowPrice),
      scoreBranchNeighborhood: (sourceBranchKey, targetBranchKey) =>
        scoreBranchNeighborhood(solved, sourceBranchKey, targetBranchKey),
    };
    cachedModel = { key: cacheKey, result };
    return result;
  } catch (error) {
    return unavailableModel({
      status: "model_error",
      statusMessage:
        error instanceof Error ? error.message : "Unable to parse or solve model.",
      rawPath,
      rawFileSizeBytes: stat.size,
      rawFileUpdatedAt: stat.mtime.toISOString(),
      westernHubBusCount: westernHubBuses.length,
    });
  }
}

function unavailableModel(args: {
  status: PjmConstraintShiftFactorModelSummary["status"];
  statusMessage: string;
  rawPath: string;
  rawFileSizeBytes?: number | null;
  rawFileUpdatedAt?: string | null;
  westernHubBusCount: number;
}): ModelResult {
  return {
    summary: {
      status: args.status,
      statusMessage: args.statusMessage,
      rawPath: args.rawPath,
      rawFilePresent: args.status !== "model_missing",
      rawFileSizeBytes: args.rawFileSizeBytes ?? null,
      rawFileUpdatedAt: args.rawFileUpdatedAt ?? null,
      busCount: 0,
      branchCount: 0,
      solved: false,
      slackBusName: null,
      westernHubBusCount: args.westernHubBusCount,
      westernHubMatchedBusCount: 0,
      westernHubFactorCoverage: 0,
    },
    estimateForFacility: () => ({
      shiftFactor: null,
      absoluteShiftFactor: null,
      estimatedWesternHubImpact: null,
      direction: "unknown",
      matchStatus: "model_unavailable",
      matchConfidence: 0,
      matchedBranchKey: null,
      matchedBranchName: null,
      fromBusNumber: null,
      fromBusName: null,
      toBusNumber: null,
      toBusName: null,
      circuitId: null,
    }),
    scoreBranchNeighborhood: () => null,
  };
}

function parseRawNetwork(text: string): ParsedRawNetwork {
  const lines = text.split(/\r?\n/);
  const busesByNumber = new Map<number, RawBus>();
  const branchRows: Array<{
    fromBusNumber: number;
    toBusNumber: number;
    circuitId: string;
    x: number;
  }> = [];
  let section: "bus" | "branch" | "transformer" | "other" = "bus";
  let index = 3;

  while (index < lines.length) {
    const rawLine = lines[index] ?? "";
    index += 1;
    const line = stripRawComment(rawLine).trim();
    if (!line) continue;
    if (/^0\s*(,|$)/.test(line)) {
      const upper = rawLine.toUpperCase();
      if (upper.includes("BEGIN BRANCH DATA")) section = "branch";
      else if (upper.includes("BEGIN TRANSFORMER DATA")) section = "transformer";
      else section = "other";
      continue;
    }

    const fields = splitRawCsv(line);
    if (section === "bus") {
      const bus = parseBus(fields);
      if (bus) busesByNumber.set(bus.number, bus);
    } else if (section === "branch") {
      const branch = parseBranch(fields);
      if (branch) branchRows.push(branch);
    } else if (section === "transformer") {
      const parsed = parseTransformer(fields, lines, index);
      index = parsed.nextIndex;
      if (parsed.branch) branchRows.push(parsed.branch);
    }
  }

  const branches = branchRows
    .map((row, index) => {
      const fromBus = busesByNumber.get(row.fromBusNumber);
      const toBus = busesByNumber.get(row.toBusNumber);
      if (!fromBus || !toBus || !Number.isFinite(row.x) || row.x <= 1e-9) {
        return null;
      }
      const name = `${fromBus.name} ${formatKv(fromBus.baseKv)} - ${toBus.name} ${formatKv(
        toBus.baseKv,
      )} ${row.circuitId}`.trim();
      return {
        index,
        key: branchKey(row.fromBusNumber, row.toBusNumber, row.circuitId),
        fromBusNumber: row.fromBusNumber,
        toBusNumber: row.toBusNumber,
        circuitId: row.circuitId,
        x: row.x,
        susceptance: 1 / row.x,
        fromBus,
        toBus,
        name,
        normalizedName: normalizeToken(name),
      };
    })
    .filter((branch): branch is Omit<RawBranch, "shiftFactor"> => branch !== null);

  return {
    buses: Array.from(busesByNumber.values()),
    branches,
  };
}

function parseBus(fields: string[]): RawBus | null {
  if (fields.length < 3) return null;
  const number = Number.parseInt(fields[0] ?? "", 10);
  const name = cleanRawString(fields[1] ?? "");
  const baseKv = Number.parseFloat(fields[2] ?? "");
  if (!Number.isFinite(number) || !name || !Number.isFinite(baseKv)) return null;
  return {
    number,
    name,
    normalizedName: normalizeToken(name),
    baseKv,
  };
}

function parseBranch(fields: string[]) {
  if (fields.length < 5) return null;
  const fromBusNumber = Number.parseInt(fields[0] ?? "", 10);
  const toBusNumber = Number.parseInt(fields[1] ?? "", 10);
  const circuitId = cleanRawString(fields[2] ?? "");
  const x = Number.parseFloat(fields[4] ?? "");
  const status = fields.length > 13 ? Number.parseInt(fields[13] ?? "1", 10) : 1;
  if (
    !Number.isFinite(fromBusNumber) ||
    !Number.isFinite(toBusNumber) ||
    !Number.isFinite(x) ||
    status === 0
  ) {
    return null;
  }
  return {
    fromBusNumber,
    toBusNumber,
    circuitId,
    x,
  };
}

function parseTransformer(
  firstFields: string[],
  lines: string[],
  nextIndex: number,
): {
  branch: { fromBusNumber: number; toBusNumber: number; circuitId: string; x: number } | null;
  nextIndex: number;
} {
  if (firstFields.length < 4) return { branch: null, nextIndex };
  const fromBusNumber = Number.parseInt(firstFields[0] ?? "", 10);
  const toBusNumber = Number.parseInt(firstFields[1] ?? "", 10);
  const thirdBusNumber = Number.parseInt(firstFields[2] ?? "0", 10);
  const circuitId = cleanRawString(firstFields[3] ?? "");
  const status = firstFields.length > 11 ? Number.parseInt(firstFields[11] ?? "1", 10) : 1;
  const impedanceLine = stripRawComment(lines[nextIndex] ?? "").trim();
  const impedanceFields = splitRawCsv(impedanceLine);
  const x = Number.parseFloat(impedanceFields[1] ?? "");
  const isThreeWinding = Number.isFinite(thirdBusNumber) && thirdBusNumber !== 0;

  return {
    branch:
      !isThreeWinding &&
      status !== 0 &&
      Number.isFinite(fromBusNumber) &&
      Number.isFinite(toBusNumber) &&
      Number.isFinite(x) &&
      Math.abs(x) >= 1e-9
        ? {
            fromBusNumber,
            toBusNumber,
            circuitId,
            x,
          }
        : null,
    nextIndex: nextIndex + (isThreeWinding ? 4 : 3),
  };
}

function solveWesternHubShiftFactors(
  network: ParsedRawNetwork,
  westernHubBuses: WesternHubBusWeight[],
  fileInfo: {
    rawPath: string;
    rawFileSizeBytes: number;
    rawFileUpdatedAt: string;
  },
): SolvedNetwork {
  const hubWeights = matchWesternHubBuses(network.buses, westernHubBuses);
  if (hubWeights.matchedWeights.size === 0 || hubWeights.factorCoverage <= 0) {
    return {
      summary: {
        status: "hub_unmatched",
        statusMessage: "Western Hub aggregate buses did not match the RAW bus list.",
        rawPath: fileInfo.rawPath,
        rawFilePresent: true,
        rawFileSizeBytes: fileInfo.rawFileSizeBytes,
        rawFileUpdatedAt: fileInfo.rawFileUpdatedAt,
        busCount: network.buses.length,
        branchCount: network.branches.length,
        solved: false,
        slackBusName: null,
        westernHubBusCount: westernHubBuses.length,
        westernHubMatchedBusCount: 0,
        westernHubFactorCoverage: 0,
      },
      branches: [],
      branchCandidateIndex: new Map(),
      branchByKey: new Map(),
      busAdjacency: new Map(),
    };
  }

  const component = selectComponent(network, hubWeights.matchedWeights);
  const componentBuses = new Set(component.busNumbers);
  const componentBranches = network.branches.filter(
    (branch) =>
      componentBuses.has(branch.fromBusNumber) && componentBuses.has(branch.toBusNumber),
  );
  const slackBusNumber = selectSlackBus(component.busNumbers, componentBranches);
  const slackBus = network.buses.find((bus) => bus.number === slackBusNumber) ?? null;
  const solved = solveAngles({
    busNumbers: component.busNumbers,
    branches: componentBranches,
    slackBusNumber,
    injections: normalizeComponentHubWeights(
      hubWeights.matchedWeights,
      componentBuses,
    ),
  });

  const branches = componentBranches.map((branch) => {
    const thetaFrom = solved.thetaByBusNumber.get(branch.fromBusNumber) ?? 0;
    const thetaTo = solved.thetaByBusNumber.get(branch.toBusNumber) ?? 0;
    return {
      ...branch,
      shiftFactor: branch.susceptance * (thetaFrom - thetaTo),
    };
  });
  const branchCandidateIndex = buildBranchCandidateIndex(branches);
  const branchByKey = new Map(branches.map((branch) => [branch.key, branch]));
  const busAdjacency = buildBusAdjacency(branches);

  return {
    summary: {
      status: solved.converged ? "ready" : "model_error",
      statusMessage: solved.converged
        ? "Model solved from RAW network file."
        : "RAW model parsed but DC solve did not converge before the iteration limit.",
      rawPath: fileInfo.rawPath,
      rawFilePresent: true,
      rawFileSizeBytes: fileInfo.rawFileSizeBytes,
      rawFileUpdatedAt: fileInfo.rawFileUpdatedAt,
      busCount: network.buses.length,
      branchCount: network.branches.length,
      solved: solved.converged,
      slackBusName: slackBus ? `${slackBus.name} ${formatKv(slackBus.baseKv)}` : null,
      westernHubBusCount: westernHubBuses.length,
      westernHubMatchedBusCount: hubWeights.matchedWeights.size,
      westernHubFactorCoverage: component.hubFactorCoverage,
    },
    branches,
    branchCandidateIndex,
    branchByKey,
    busAdjacency,
  };
}

function buildBranchCandidateIndex(branches: RawBranch[]): Map<string, RawBranch[]> {
  const index = new Map<string, RawBranch[]>();
  for (const branch of branches) {
    for (const name of [branch.fromBus.normalizedName, branch.toBus.normalizedName]) {
      const maxLength = Math.min(name.length, 14);
      for (let length = 3; length <= maxLength; length += 1) {
        const token = name.slice(0, length);
        const values = index.get(token);
        if (values) values.push(branch);
        else index.set(token, [branch]);
      }
      const values = index.get(name);
      if (values) values.push(branch);
      else index.set(name, [branch]);
    }
  }
  return index;
}

function buildBusAdjacency(branches: RawBranch[]): Map<number, number[]> {
  const adjacency = new Map<number, Set<number>>();
  for (const branch of branches) {
    const fromNeighbors = adjacency.get(branch.fromBusNumber) ?? new Set<number>();
    const toNeighbors = adjacency.get(branch.toBusNumber) ?? new Set<number>();
    fromNeighbors.add(branch.toBusNumber);
    toNeighbors.add(branch.fromBusNumber);
    adjacency.set(branch.fromBusNumber, fromNeighbors);
    adjacency.set(branch.toBusNumber, toNeighbors);
  }
  return new Map(
    Array.from(adjacency.entries()).map(([busNumber, neighbors]) => [
      busNumber,
      Array.from(neighbors),
    ]),
  );
}

function matchWesternHubBuses(
  buses: RawBus[],
  westernHubBuses: WesternHubBusWeight[],
): { matchedWeights: Map<number, number>; factorCoverage: number } {
  const matchedWeights = new Map<number, number>();
  let factorCoverage = 0;
  for (const hubBus of westernHubBuses) {
    const parsed = parsePnodeBusName(hubBus.busPnodeName);
    const match = bestBusMatch(buses, parsed.stationName, parsed.baseKv);
    if (!match) continue;
    matchedWeights.set(
      match.number,
      (matchedWeights.get(match.number) ?? 0) + hubBus.busPnodeFactor,
    );
    factorCoverage += hubBus.busPnodeFactor;
  }
  return { matchedWeights, factorCoverage };
}

function parsePnodeBusName(value: string): { stationName: string; baseKv: number | null } {
  const cleaned = value.replace(/\s+/g, " ").trim();
  const kvMatch = cleaned.match(/^(.+?)(\d+(?:\.\d+)?)\s*KV\b/i);
  if (kvMatch) {
    return {
      stationName: kvMatch[1].trim(),
      baseKv: Number.parseFloat(kvMatch[2]),
    };
  }
  const firstToken = cleaned.split(/\s+/)[0] ?? cleaned;
  return {
    stationName: firstToken.replace(/EHV$/i, ""),
    baseKv: null,
  };
}

function bestBusMatch(
  buses: RawBus[],
  stationName: string,
  baseKv: number | null,
): RawBus | null {
  const station = normalizeToken(stationName);
  if (!station) return null;
  let best: { bus: RawBus; score: number } | null = null;
  let secondScore = 0;
  for (const bus of buses) {
    const nameScore = busNameScore(station, bus.normalizedName);
    if (nameScore <= 0) continue;
    const kvScore =
      baseKv === null ? 0.15 : voltageMatches(baseKv, bus.baseKv) ? 0.35 : -0.2;
    const score = nameScore + kvScore;
    if (!best || score > best.score) {
      secondScore = best?.score ?? 0;
      best = { bus, score };
    } else if (score > secondScore) {
      secondScore = score;
    }
  }
  if (!best || best.score < 0.75) return null;
  if (secondScore > 0 && best.score - secondScore < 0.05) return null;
  return best.bus;
}

function selectComponent(
  network: ParsedRawNetwork,
  hubWeights: Map<number, number>,
): { busNumbers: number[]; hubFactorCoverage: number } {
  const adjacency = new Map<number, number[]>();
  for (const bus of network.buses) adjacency.set(bus.number, []);
  for (const branch of network.branches) {
    adjacency.get(branch.fromBusNumber)?.push(branch.toBusNumber);
    adjacency.get(branch.toBusNumber)?.push(branch.fromBusNumber);
  }

  const seen = new Set<number>();
  let best = { busNumbers: [] as number[], hubFactorCoverage: 0 };
  for (const bus of network.buses) {
    if (seen.has(bus.number)) continue;
    const stack = [bus.number];
    const component: number[] = [];
    let hubFactorCoverage = 0;
    seen.add(bus.number);
    while (stack.length) {
      const next = stack.pop();
      if (next === undefined) continue;
      component.push(next);
      hubFactorCoverage += hubWeights.get(next) ?? 0;
      for (const neighbor of adjacency.get(next) ?? []) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        stack.push(neighbor);
      }
    }
    if (
      hubFactorCoverage > best.hubFactorCoverage ||
      (hubFactorCoverage === best.hubFactorCoverage &&
        component.length > best.busNumbers.length)
    ) {
      best = { busNumbers: component, hubFactorCoverage };
    }
  }
  return best;
}

function selectSlackBus(busNumbers: number[], branches: Omit<RawBranch, "shiftFactor">[]): number {
  const degree = new Map<number, number>();
  for (const busNumber of busNumbers) degree.set(busNumber, 0);
  for (const branch of branches) {
    degree.set(branch.fromBusNumber, (degree.get(branch.fromBusNumber) ?? 0) + 1);
    degree.set(branch.toBusNumber, (degree.get(branch.toBusNumber) ?? 0) + 1);
  }
  return busNumbers.reduce((best, busNumber) =>
    (degree.get(busNumber) ?? 0) > (degree.get(best) ?? 0) ? busNumber : best,
  );
}

function normalizeComponentHubWeights(
  hubWeights: Map<number, number>,
  componentBuses: Set<number>,
): Map<number, number> {
  const componentWeights = new Map<number, number>();
  let total = 0;
  for (const [busNumber, factor] of hubWeights) {
    if (!componentBuses.has(busNumber)) continue;
    componentWeights.set(busNumber, factor);
    total += factor;
  }
  if (total <= 0) return componentWeights;
  for (const [busNumber, factor] of componentWeights) {
    componentWeights.set(busNumber, factor / total);
  }
  return componentWeights;
}

function solveAngles(args: {
  busNumbers: number[];
  branches: Omit<RawBranch, "shiftFactor">[];
  slackBusNumber: number;
  injections: Map<number, number>;
}): { thetaByBusNumber: Map<number, number>; converged: boolean } {
  const reducedBusNumbers = args.busNumbers.filter(
    (busNumber) => busNumber !== args.slackBusNumber,
  );
  const indexByBusNumber = new Map<number, number>();
  reducedBusNumbers.forEach((busNumber, index) => indexByBusNumber.set(busNumber, index));
  const n = reducedBusNumbers.length;
  const diagonal = new Float64Array(n);
  const edges: Array<[number, number, number]> = [];

  for (const branch of args.branches) {
    const fromIndex = indexByBusNumber.get(branch.fromBusNumber);
    const toIndex = indexByBusNumber.get(branch.toBusNumber);
    const b = branch.susceptance;
    if (fromIndex !== undefined) diagonal[fromIndex] += b;
    if (toIndex !== undefined) diagonal[toIndex] += b;
    if (fromIndex !== undefined && toIndex !== undefined) {
      edges.push([fromIndex, toIndex, b]);
    }
  }

  const rhs = new Float64Array(n);
  for (const [busNumber, injection] of args.injections) {
    const index = indexByBusNumber.get(busNumber);
    if (index !== undefined) rhs[index] += injection;
  }

  const solution = conjugateGradient({
    diagonal,
    edges,
    rhs,
    tolerance: SOLVE_TOLERANCE,
    maxIterations: Math.min(SOLVE_MAX_ITERATIONS, Math.max(200, n * 2)),
  });
  const thetaByBusNumber = new Map<number, number>();
  thetaByBusNumber.set(args.slackBusNumber, 0);
  reducedBusNumbers.forEach((busNumber, index) =>
    thetaByBusNumber.set(busNumber, solution.x[index] ?? 0),
  );

  return {
    thetaByBusNumber,
    converged: solution.converged,
  };
}

function conjugateGradient(args: {
  diagonal: Float64Array;
  edges: Array<[number, number, number]>;
  rhs: Float64Array;
  tolerance: number;
  maxIterations: number;
}): { x: Float64Array; converged: boolean } {
  const n = args.rhs.length;
  const x = new Float64Array(n);
  const r = new Float64Array(args.rhs);
  const z = new Float64Array(n);
  const p = new Float64Array(n);
  const ap = new Float64Array(n);
  applyPreconditioner(args.diagonal, r, z);
  p.set(z);
  let rz = dot(r, z);
  const rhsNorm = Math.sqrt(Math.max(dot(args.rhs, args.rhs), 1));

  for (let iteration = 0; iteration < args.maxIterations; iteration += 1) {
    multiplyLaplacian(args.diagonal, args.edges, p, ap);
    const denom = dot(p, ap);
    if (Math.abs(denom) < 1e-20) break;
    const alpha = rz / denom;
    for (let i = 0; i < n; i += 1) {
      x[i] += alpha * p[i];
      r[i] -= alpha * ap[i];
    }
    if (Math.sqrt(dot(r, r)) / rhsNorm < args.tolerance) {
      return { x, converged: true };
    }
    applyPreconditioner(args.diagonal, r, z);
    const nextRz = dot(r, z);
    const beta = nextRz / rz;
    for (let i = 0; i < n; i += 1) {
      p[i] = z[i] + beta * p[i];
    }
    rz = nextRz;
  }

  return { x, converged: false };
}

function multiplyLaplacian(
  diagonal: Float64Array,
  edges: Array<[number, number, number]>,
  vector: Float64Array,
  output: Float64Array,
): void {
  output.fill(0);
  for (let i = 0; i < diagonal.length; i += 1) {
    output[i] += diagonal[i] * vector[i];
  }
  for (const [fromIndex, toIndex, b] of edges) {
    output[fromIndex] -= b * vector[toIndex];
    output[toIndex] -= b * vector[fromIndex];
  }
}

function applyPreconditioner(
  diagonal: Float64Array,
  vector: Float64Array,
  output: Float64Array,
): void {
  for (let i = 0; i < vector.length; i += 1) {
    output[i] = vector[i] / (Math.abs(diagonal[i]) > 1e-12 ? diagonal[i] : 1);
  }
}

function dot(left: Float64Array, right: Float64Array): number {
  let total = 0;
  for (let i = 0; i < left.length; i += 1) total += left[i] * right[i];
  return total;
}

function estimateForFacility(
  solved: SolvedNetwork,
  monitoredFacility: string,
  averageShadowPrice: number,
): ConstraintShiftEstimate {
  if (!solved.summary.solved || !solved.branches.length) {
    return {
      shiftFactor: null,
      absoluteShiftFactor: null,
      estimatedWesternHubImpact: null,
      direction: "unknown",
      matchStatus: "model_unavailable",
      matchConfidence: 0,
      matchedBranchKey: null,
      matchedBranchName: null,
      fromBusNumber: null,
      fromBusName: null,
      toBusNumber: null,
      toBusName: null,
      circuitId: null,
    };
  }

  const match = matchBranch(monitoredFacility, solved);
  if (!match.branch) {
    return {
      shiftFactor: null,
      absoluteShiftFactor: null,
      estimatedWesternHubImpact: null,
      direction: "unknown",
      matchStatus: match.status,
      matchConfidence: match.confidence,
      matchedBranchKey: null,
      matchedBranchName: null,
      fromBusNumber: null,
      fromBusName: null,
      toBusNumber: null,
      toBusName: null,
      circuitId: null,
    };
  }

  const shiftFactor = match.branch.shiftFactor;
  const estimatedWesternHubImpact = shiftFactor * averageShadowPrice;
  return {
    shiftFactor,
    absoluteShiftFactor: Math.abs(shiftFactor),
    estimatedWesternHubImpact,
    direction: shiftDirection(estimatedWesternHubImpact),
    matchStatus: match.status,
    matchConfidence: match.confidence,
    matchedBranchKey: match.branch.key,
    matchedBranchName: match.branch.name,
    fromBusNumber: match.branch.fromBusNumber,
    fromBusName: `${match.branch.fromBus.name} ${formatKv(match.branch.fromBus.baseKv)}`,
    toBusNumber: match.branch.toBusNumber,
    toBusName: `${match.branch.toBus.name} ${formatKv(match.branch.toBus.baseKv)}`,
    circuitId: match.branch.circuitId,
  };
}

function scoreBranchNeighborhood(
  solved: SolvedNetwork,
  sourceBranchKey: string | null | undefined,
  targetBranchKey: string | null | undefined,
): RawBranchNeighborhoodScore | null {
  const sourceKey = normalizeBranchKey(sourceBranchKey);
  const targetKey = normalizeBranchKey(targetBranchKey);
  if (!sourceKey || !targetKey || !solved.summary.solved) return null;

  const sourceBranch = solved.branchByKey.get(sourceKey);
  const targetBranch = solved.branchByKey.get(targetKey);
  if (!sourceBranch || !targetBranch) return null;

  if (sourceBranch.key === targetBranch.key) {
    return {
      relation: "same_branch",
      score: 1,
      hopDistance: 0,
      sharedBusNumber: null,
    };
  }

  const sharedBusNumber = sharedEndpointBus(sourceBranch, targetBranch);
  if (sharedBusNumber !== null) {
    return {
      relation: "shared_bus",
      score: 0.88,
      hopDistance: 0,
      sharedBusNumber,
    };
  }

  const hopDistance = endpointHopDistance(sourceBranch, targetBranch, solved.busAdjacency, 2);
  if (hopDistance !== null && hopDistance <= 2) {
    return {
      relation: "nearby_raw",
      score: hopDistance === 1 ? 0.72 : 0.66,
      hopDistance,
      sharedBusNumber: null,
    };
  }

  return null;
}

function sharedEndpointBus(left: RawBranch, right: RawBranch): number | null {
  const leftEndpoints = new Set([left.fromBusNumber, left.toBusNumber]);
  if (leftEndpoints.has(right.fromBusNumber)) return right.fromBusNumber;
  if (leftEndpoints.has(right.toBusNumber)) return right.toBusNumber;
  return null;
}

function endpointHopDistance(
  sourceBranch: RawBranch,
  targetBranch: RawBranch,
  adjacency: Map<number, number[]>,
  maxDepth: number,
): number | null {
  const targetBuses = new Set([targetBranch.fromBusNumber, targetBranch.toBusNumber]);
  const queue: Array<{ busNumber: number; depth: number }> = [
    { busNumber: sourceBranch.fromBusNumber, depth: 0 },
    { busNumber: sourceBranch.toBusNumber, depth: 0 },
  ];
  const seen = new Set(queue.map((entry) => entry.busNumber));

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    if (targetBuses.has(next.busNumber)) return next.depth;
    if (next.depth >= maxDepth) continue;
    for (const neighbor of adjacency.get(next.busNumber) ?? []) {
      if (seen.has(neighbor)) continue;
      seen.add(neighbor);
      queue.push({ busNumber: neighbor, depth: next.depth + 1 });
    }
  }

  return null;
}

function matchBranch(
  monitoredFacility: string,
  solved: SolvedNetwork,
): {
  branch: RawBranch | null;
  status: "matched" | "ambiguous" | "no_match";
  confidence: number;
} {
  const features = constraintFacilityFeatures(monitoredFacility);
  if (!features.tokens.length && features.baseKv === null) {
    return { branch: null, status: "no_match", confidence: 0 };
  }

  const branches = branchCandidates(solved, features.tokens);
  if (branches.length === 0) {
    return { branch: null, status: "no_match", confidence: 0 };
  }

  let best: { branch: RawBranch; score: number } | null = null;
  let secondScore = 0;
  for (const branch of branches) {
    const score = branchMatchScore(branch, features);
    if (!best || score > best.score) {
      secondScore = best?.score ?? 0;
      best = { branch, score };
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (!best || best.score < MIN_BRANCH_MATCH_CONFIDENCE) {
    return {
      branch: null,
      status: "no_match",
      confidence: Math.max(0, best?.score ?? 0),
    };
  }
  if (secondScore > 0 && best.score - secondScore < 0.06) {
    return { branch: best.branch, status: "ambiguous", confidence: best.score };
  }
  return { branch: best.branch, status: "matched", confidence: best.score };
}

function branchCandidates(solved: SolvedNetwork, tokens: string[]): RawBranch[] {
  const candidates = new Map<number, RawBranch>();
  for (const token of tokens) {
    const normalizedToken = normalizeToken(token);
    if (normalizedToken.length < 3) continue;
    const direct = solved.branchCandidateIndex.get(normalizedToken);
    if (direct) {
      for (const branch of direct) candidates.set(branch.index, branch);
      continue;
    }
    const prefix = solved.branchCandidateIndex.get(normalizedToken.slice(0, 14));
    if (prefix) {
      for (const branch of prefix) candidates.set(branch.index, branch);
    }
  }
  return Array.from(candidates.values());
}

function constraintFacilityFeatures(value: string): {
  tokens: string[];
  baseKv: number | null;
} {
  const upper = value.toUpperCase();
  const kvMatch = upper.match(/(\d+(?:\.\d+)?)\s*KV/);
  const baseKv = kvMatch ? Number.parseFloat(kvMatch[1]) : null;
  const afterKv = kvMatch
    ? upper.slice((kvMatch.index ?? 0) + kvMatch[0].length)
    : upper;
  const endpointTokens = afterKv
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length >= 3 && !STOP_TOKENS.has(token));
  const fallbackTokens = upper
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length >= 4 && !STOP_TOKENS.has(token));
  const tokens = Array.from(new Set([...endpointTokens, ...fallbackTokens])).slice(0, 8);
  return { tokens, baseKv };
}

const STOP_TOKENS = new Set([
  "ACTUAL",
  "BRKR",
  "LINE",
  "LOAD",
  "TRANSFORMER",
  "XF",
  "XFM",
  "XFMR",
  "KV",
  "MVA",
  "TAP",
]);

function branchMatchScore(
  branch: RawBranch,
  features: { tokens: string[]; baseKv: number | null },
): number {
  let score = 0;
  if (
    features.baseKv !== null &&
    (voltageMatches(features.baseKv, branch.fromBus.baseKv) ||
      voltageMatches(features.baseKv, branch.toBus.baseKv))
  ) {
    score += 0.22;
  }

  let endpointHits = 0;
  for (const token of features.tokens) {
    const normalizedToken = normalizeToken(token);
    if (!normalizedToken) continue;
    const fromHit = tokenMatchesBus(normalizedToken, branch.fromBus.normalizedName);
    const toHit = tokenMatchesBus(normalizedToken, branch.toBus.normalizedName);
    if (fromHit || toHit) {
      endpointHits += 1;
      score += 0.24;
    } else if (branch.normalizedName.includes(normalizedToken)) {
      score += 0.1;
    }
  }

  if (endpointHits >= 2) score += 0.22;
  return Math.min(1, score);
}

function busNameScore(token: string, busName: string): number {
  if (busName === token) return 0.7;
  if (busName.startsWith(token) || token.startsWith(busName)) return 0.58;
  if (busName.includes(token) || token.includes(busName)) return 0.45;
  return 0;
}

function tokenMatchesBus(token: string, busName: string): boolean {
  return busName === token || busName.startsWith(token) || busName.includes(token);
}

function voltageMatches(left: number, right: number): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  const tolerance = Math.max(1.5, Math.abs(left) * 0.04);
  return Math.abs(left - right) <= tolerance;
}

function shiftDirection(value: number): PjmConstraintShiftDirection {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-6) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function splitRawCsv(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuote = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "'") {
      inQuote = !inQuote;
      current += char;
    } else if (char === "," && !inQuote) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function stripRawComment(line: string): string {
  let inQuote = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "'") inQuote = !inQuote;
    if (char === "/" && !inQuote) return line.slice(0, index);
  }
  return line;
}

function cleanRawString(value: string): string {
  return value.replace(/^'/, "").replace(/'$/, "").trim();
}

function branchKey(fromBusNumber: number, toBusNumber: number, circuitId: string): string {
  const [left, right] =
    fromBusNumber <= toBusNumber ? [fromBusNumber, toBusNumber] : [toBusNumber, fromBusNumber];
  return `${left}-${right}-${normalizeBranchCircuitId(circuitId) || "1"}`;
}

function normalizeBranchKey(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text.toUpperCase() : null;
}

function normalizeBranchCircuitId(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function normalizeToken(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function formatKv(value: number): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}KV`;
}
