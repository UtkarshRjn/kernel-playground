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
