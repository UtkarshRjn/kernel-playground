# Kernel Playground

"Colab for kernel code" — a zero-setup, browser-based playground to write GPU kernels and run
the **same kernel across multiple GPUs** (T4, A100, B200, ...) to compare real performance and
cost, side by side.

**Core wedge:** cross-GPU comparison of *your own* kernel, with trustworthy benchmarking —
something existing playgrounds (cuda.live, LeetGPU, Colab, Tensara) don't offer.

## Monorepo layout

```
apps/web/             Next.js (App Router) web app + API  — TypeScript
packages/shared/      Shared contracts: ExecutionProvider, run/benchmark types
services/execution/   GPU execution + benchmark backend (Modal) — Python
docs/                 Feature spec + build plan
```

## Stack
- **Web/API:** Next.js + React + TypeScript (Vercel)
- **Orchestration API:** container on Fly.io (Phase 1)
- **Execution:** Modal serverless GPUs (CUDA + Triton at launch)
- **DB / cache / storage:** Postgres + Redis + R2 (Phase 1)
- **Auth:** Auth.js · **Billing:** Stripe + own credit ledger

## Develop
```bash
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install
pnpm -r build        # build shared + web
pnpm dev             # run the web app

# Python execution backend
cd services/execution && pip install -e ".[dev]" && pytest -q
```

## Database migrations
Prisma Migrate owns the schema (`apps/web/prisma/migrations/`); don't use `prisma db push`
against shared databases. `0_init` is the baseline matching the schema prod was created with.

- **Deploys:** Vercel runs `vercel-build` (`prisma generate && next build && prisma migrate deploy`).
  Migrations only run for `VERCEL_ENV=production` (set `PRISMA_MIGRATE_ON_BUILD=1` for previews
  that have their own DB). `DIRECT_URL` (non-pooled connection) must be set in Vercel for
  Neon/Supabase. The plain `build` script never touches the DB.
- **CI:** the `migrations` job applies all migrations to an empty Postgres and fails if the result
  differs from `schema.prisma`.

**One-time: baseline the existing production DB** (it was created with `db push`, so it already
has the `0_init` tables). Do this **before the first deploy that includes `prisma/migrations/`**;
otherwise `migrate deploy` refuses to run on the non-empty DB (`P3005`) and the production build fails.
```bash
cd apps/web
export DATABASE_URL="<prod direct URL>" DIRECT_URL="<prod direct URL>"
pnpm exec prisma migrate diff --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --exit-code   # expect exit 0 (prod == schema)
pnpm exec prisma migrate resolve --applied 0_init         # record 0_init as applied, runs no SQL
pnpm exec prisma migrate status                          # expect "Database schema is up to date"
```
If the diff is non-empty, prod has drifted from the schema; reconcile that first instead of
resolving. Repeat for any other long-lived DB (staging, preview) created with `db push`.

**Adding a migration:** edit `schema.prisma`, then against a local/dev Postgres (never prod):
```bash
pnpm --filter @kp/web exec prisma migrate dev --name add_something
```
Commit the generated `prisma/migrations/<timestamp>_add_something/` with the schema change.
Keep migrations backward compatible with the previous deploy (add columns nullable/defaulted,
drop in a later release); they run after `next build`, before the new deployment is promoted.

## Docs
- [docs/FEATURES.md](docs/FEATURES.md) — full feature specification (all 12 sections)
- [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) — architecture, tech stack, phased build order

## Build phases (PRs stack in this order)
0. **Foundations** — monorepo, shared contracts, web skeleton, execution harness core ← _this PR_
1. Safe single-GPU run pipeline + credit hold/settle + sandbox
2. Benchmarking rigor (the moat)
3. Cross-GPU comparison (the wedge)
4. Billing & quotas (Stripe)
5. Accounts, sharing, persistence
