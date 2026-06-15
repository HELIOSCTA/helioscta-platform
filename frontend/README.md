# PJM Fundies Frontend

Next.js 15, React 19, Tailwind, Recharts, and `pg` dashboard for prices-first
PJM short-term fundamentals.

## Runtime Contract

The frontend reads from `helios_prod` with `helios_readonly`. Do not expose
database secrets through `NEXT_PUBLIC_*` variables.

Set either:

```text
DATABASE_URL=postgres://helios_readonly:<password>@<host>:5432/helios_prod?sslmode=require
```

or:

```text
HELIOS_POSTGRES_READONLY_HOST=
HELIOS_POSTGRES_READONLY_USER=helios_readonly
HELIOS_POSTGRES_READONLY_PASSWORD=
HELIOS_POSTGRES_READONLY_PORT=5432
HELIOS_POSTGRES_READONLY_DBNAME=helios_prod
HELIOS_POSTGRES_READONLY_SSLMODE=require
```

## Local Development

```bash
cd frontend
npm install
npm run dev
npm run lint
npm run build
```

The production route is `/`. The active compatibility API routes are:

```text
GET /api/ops/readiness
GET /api/pjm-da-lmps?date=YYYY-MM-DD
GET /api/pjm-rt-lmps?date=YYYY-MM-DD&source=unverified
GET /api/pjm-lmp-settles?start=YYYY-MM-DD&end=YYYY-MM-DD&hub=WESTERN%20HUB&component=total&rtSource=unverified
GET /api/pjm-outages?view=forecast&region=RTO
GET /api/pjm-outages?view=seasonal&region=RTO
```

## Production Endpoint Standard

Every dashboard API route should use the shared server observability wrapper in
`lib/server/apiObservability.ts` and the measured Postgres helper in
`lib/server/db.ts`.

Production routes should expose:

- Bounded inputs for any date range, execution count, or large-result selector.
- A clear `Cache-Control` policy with stale-while-revalidate when safe.
- Structured logs with route, status, duration, DB duration, DB query count,
  row count, payload bytes, cache policy, data-as-of, and error type.
- Internal diagnostics headers: `Server-Timing`, `X-Helios-Route`,
  `X-Helios-Cache-Policy`, and `X-Helios-Data-As-Of`.
- A freshness source tied to table timestamps or `ops.data_availability_events`.

Use Vercel Observability to rank weak endpoints by function duration, errors,
and status codes. Use Postgres query statistics or Azure query performance
tools to connect slow routes back to slow SQL.

## Vercel

Configure the Vercel project root as `frontend`. Production access is expected
to be handled by Vercel/SSO/project access, not app-level auth.
