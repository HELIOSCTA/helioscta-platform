#!/usr/bin/env node

import { execFileSync, execSync } from "node:child_process";

const DEFAULT_SCOPE = "helioscta";
const DEFAULT_PROJECT = "frontend";
const DEFAULT_PRODUCTION_ALIAS = "frontend-helioscta.vercel.app";
const DEFAULT_MAIN_ALIAS = "frontend-git-main-helioscta.vercel.app";

function parseArgs(argv) {
  const options = {
    fix: false,
    scope: process.env.VERCEL_SCOPE ?? DEFAULT_SCOPE,
    project: process.env.VERCEL_PROJECT ?? DEFAULT_PROJECT,
    productionAlias: process.env.HELIOS_PRODUCTION_ALIAS ?? DEFAULT_PRODUCTION_ALIAS,
    mainAlias: process.env.HELIOS_MAIN_ALIAS ?? DEFAULT_MAIN_ALIAS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fix") {
      options.fix = true;
    } else if (arg === "--scope") {
      options.scope = requiredValue(argv, index, arg);
      index += 1;
    } else if (arg === "--project") {
      options.project = requiredValue(argv, index, arg);
      index += 1;
    } else if (arg === "--production-alias") {
      options.productionAlias = requiredValue(argv, index, arg);
      index += 1;
    } else if (arg === "--main-alias") {
      options.mainAlias = requiredValue(argv, index, arg);
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
Check that the production Vercel domain tracks the latest main deployment.

Usage:
  npm run check:vercel-production
  npm run check:vercel-production -- --fix

Options:
  --fix                       Repoint the production alias to the main alias deployment.
  --scope <scope>             Vercel scope. Default: ${DEFAULT_SCOPE}
  --project <project>         Vercel project. Default: ${DEFAULT_PROJECT}
  --production-alias <alias>  Production domain. Default: ${DEFAULT_PRODUCTION_ALIAS}
  --main-alias <alias>        Main branch alias. Default: ${DEFAULT_MAIN_ALIAS}
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
  const production = inspectDeployment(options.productionAlias, options);
  const mainAlias = inspectDeployment(options.mainAlias, options);
  const latestByUrl = inspectDeployment(latest.url, options);

  summarizeDeployment("Latest READY production", {
    id: latestByUrl.id,
    url: latest.url,
    target: latest.target,
    readyState: latest.state,
  });
  summarizeDeployment("Production alias", production);
  summarizeDeployment("Main branch alias", mainAlias);

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

  if (mainAlias.id !== latestByUrl.id) {
    fail(
      `${options.mainAlias} points to ${mainAlias.id}, but latest READY production is ${latestByUrl.id}.`,
    );
  }

  if (production.id !== mainAlias.id) {
    if (!options.fix) {
      fail(
        `${options.productionAlias} points to ${production.id}, while ${options.mainAlias} points to ` +
          `${mainAlias.id}. Run npm run check:vercel-production -- --fix to repoint production to main.`,
      );
      return;
    }

    console.log(
      `\nRepointing ${options.productionAlias} to ${mainAlias.url} because main alias is the latest main production deployment.`,
    );
    runVercel([
      "alias",
      "set",
      mainAlias.url,
      options.productionAlias,
      "--scope",
      options.scope,
    ], { inherit: true });

    const repaired = inspectDeployment(options.productionAlias, options);
    if (repaired.id !== mainAlias.id) {
      fail(`Repair did not converge: ${options.productionAlias} now points to ${repaired.id}.`);
      return;
    }
    console.log(`Repair complete: ${options.productionAlias} now points to ${repaired.id}.`);
  }

  if (process.exitCode) return;
  console.log(
    `\nOK: ${options.productionAlias} tracks latest origin/main production deployment ` +
      `${latestByUrl.id}${deployedSha ? ` (${deployedSha})` : ""}.`,
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
