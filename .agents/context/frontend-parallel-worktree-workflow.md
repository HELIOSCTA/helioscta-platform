# Frontend Parallel Worktree Workflow

Use this note when multiple agents may edit or inspect different frontend pages
at the same time.

## Core Rule

Do not run multiple `next dev` servers from the same `frontend/` directory.
Next.js writes shared state into `.next`; parallel agents in one checkout can
corrupt or race on `routes-manifest.json`, chunk files, webpack cache packs,
and hot-reload state. Port `3000` should be reserved for the integration
checkout unless the user explicitly asks otherwise.

## Recommended Layout

Use one git worktree per active frontend agent:

```powershell
git worktree add ..\helioscta-agent-power -b agent/power-pricing
git worktree add ..\helioscta-agent-gas -b agent/gas-prices
git worktree add ..\helioscta-agent-ice -b agent/ice-pmi
```

Copy local frontend environment files into each worktree before running the
app:

```powershell
Copy-Item frontend\.env.local ..\helioscta-agent-power\frontend\.env.local
```

Run each worktree on its own port:

```powershell
cd ..\helioscta-agent-power\frontend
npm run dev -- --port 3001

cd ..\helioscta-agent-gas\frontend
npm run dev -- --port 3002
```

Keep the main checkout on `3000` for merged/integration review:

```powershell
cd .\frontend
npm run dev -- --port 3000
```

## Agent Rules

- Own exactly one worktree and one port while doing active frontend work.
- Do not delete `.next` while a dev server is running.
- Do not run `npm run build` in the same worktree while `npm run dev` is
  running there.
- Do not kill port `3000` unless working in the integration checkout or the user
  explicitly asks to restart the integration site.
- Verify page work against the agent worktree port first, then merge and verify
  on `3000`.

## Sync And Merge

Commit in the agent worktree:

```powershell
cd ..\helioscta-agent-power
git status
git add frontend/components/spark/SparkSpreadEvolution.tsx
git commit -m "Build power pricing evolution view"
```

Merge from the integration checkout:

```powershell
cd ..\helioscta-platform
git merge agent/power-pricing
```

Sync integration changes back into an agent worktree:

```powershell
cd ..\helioscta-agent-power
git fetch --all
git merge main
```

If the repo's integration branch is not `main`, use
`git branch --show-current` in the integration checkout and merge that branch
instead.

Remove a finished worktree only after merging or intentionally abandoning the
branch:

```powershell
git worktree remove ..\helioscta-agent-power
git branch -d agent/power-pricing
```

## When Worktrees Are Not Needed

Worktrees are optional when exactly one agent is coding and all other agents are
only planning or reviewing. In that mode, use one checkout and one dev server,
and coordinate before restarting the server, running a build, or clearing
`.next`.
