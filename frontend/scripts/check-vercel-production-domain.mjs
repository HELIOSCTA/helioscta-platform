#!/usr/bin/env node

import { execFileSync, execSync } from "node:child_process";

const DEFAULT_SCOPE = "helioscta";
const DEFAULT_PROJECT = "frontend";
const DEFAULT_PRODUCTION_DOMAIN = "frontend-helioscta.vercel.app";

function parseArgs(argv) {
  const options = {
    scope: process.env.VERCEL_SCOPE ?? DEFAULT_SCOPE,
    project: process.env.VERCEL_PROJECT ?? DEFAULT_PROJECT,
    productionDomain: process.env.HELIOS_VERCEL_PRODUCTION_DOMAIN ?? DEFAULT_PRODUCTION_DOMAIN,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fix") {
      throw new Error(
        "Manual Vercel domain repair is not supported. Push or redeploy from the GitHub production branch instead.",
      );
    } else if (arg === "--scope") {
      options.scope = requiredValue(argv, index, arg);
      index += 1;
    } else if (arg === "--project") {
      options.project = requiredValue(argv, index, arg);
      index += 1;
    } else if (arg === "--production-domain" || arg === "--domain") {
      options.productionDomain = requiredValue(argv, index, arg);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function printHelp() {
  console.log(`
Check that Vercel's canonical production domain tracks the latest main deployment.

Usage:
  npm run check:vercel-production

Options:
  --scope <scope>                   Vercel scope. Default: ${DEFAULT_SCOPE}
  --project <project>               Vercel project. Default: ${DEFAULT_PROJECT}
  --production-domain <domain>      Canonical production domain. Default: ${DEFAULT_PRODUCTION_DOMAIN}
`);
}

function quoteCmdArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function runVercel(args, options = {}) {
  if (process.platform === "win32") {
    return execSync(`npx vercel ${args.map(quoteCmdArg).join(" ")}`, {
      encoding: "utf8",
      stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });
  }

  return execFileSync("npx", ["vercel", ...args], {
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
}

function runGit(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function parseJsonOutput(output, label) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`Unable to parse ${label} JSON output: ${error.message}`);
  }
}

function inspectDeployment(aliasOrUrl, options) {
  const output = runVercel([
    "inspect",
    aliasOrUrl,
    "--scope",
    options.scope,
    "--json",
  ]);
  return parseJsonOutput(output, `vercel inspect ${aliasOrUrl}`);
}

function latestProductionDeployment(options) {
  const output = runVercel([
    "ls",
    options.project,
    "--scope",
    options.scope,
    "--environment",
    "production",
    "--status",
    "READY",
    "--limit",
    "1",
    "--json",
  ]);
  const payload = parseJsonOutput(output, "vercel ls");
  const deployment = payload.deployments?.[0];
  if (!deployment) {
    throw new Error(`No READY production deployments found for ${options.scope}/${options.project}.`);
  }
  return deployment;
}

function remoteMainSha() {
  const output = runGit(["ls-remote", "origin", "refs/heads/main"]);
  return output?.split(/\s+/)[0] ?? null;
}

function summarizeDeployment(label, deployment) {
  console.log(
    `${label}: ${deployment.id ?? "(no id)"} -> ${deployment.url} ` +
      `[${deployment.target ?? deployment.state ?? "unknown"} ${deployment.readyState ?? ""}]`,
  );
}

function fail(message) {
  console.error(`\nERROR: ${message}`);
  process.exitCode = 1;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const latest = latestProductionDeployment(options);
  const productionDomain = inspectDeployment(options.productionDomain, options);
  const latestByUrl = inspectDeployment(latest.url, options);

  summarizeDeployment("Latest READY production", {
    id: latestByUrl.id,
    url: latest.url,
    target: latest.target,
    readyState: latest.state,
  });
  summarizeDeployment("Production domain", productionDomain);

  const latestBranch = latest.meta?.githubCommitRef ?? null;
  if (latestBranch !== "main") {
    fail(
      `Latest READY production deployment is from branch ${latestBranch ?? "(unknown)"}, expected main.`,
    );
  }

  const gitRemoteMainSha = remoteMainSha();
  const deployedSha = latest.meta?.githubCommitSha ?? null;
  if (gitRemoteMainSha && deployedSha && gitRemoteMainSha !== deployedSha) {
    fail(`Latest READY production SHA ${deployedSha} does not match origin/main ${gitRemoteMainSha}.`);
  }

  if (productionDomain.id !== latestByUrl.id) {
    fail(
      `${options.productionDomain} points to ${productionDomain.id}, but latest READY production is ${latestByUrl.id}. ` +
        "Wait for the GitHub production deployment to finish or redeploy from GitHub; do not repair with vercel alias set.",
    );
  }

  if (process.exitCode) return;
  console.log(
    `\nOK: ${options.productionDomain} tracks latest origin/main production deployment ` +
      `${latestByUrl.id}${deployedSha ? ` (${deployedSha})` : ""}.`,
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
