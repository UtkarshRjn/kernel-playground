# Build Plan — Kernel Playground

Architecture, tech-stack choices, and the order to build in. Scope is centered on the
load-bearing pieces: **§3 cross-GPU comparison**, **§4 benchmarking rigor**,
**§8 billing/credits**, **§11 sandboxing**. Polish features (§5 deep profiling, §10 CLI/API,
§12 community) are deferred but designed-for.

---

## 1. Guiding principles

1. **De-risk the hard parts first.** The risk is not the editor — it is (a) running untrusted
   code safely on GPUs, (b) measuring it *trustworthily*, and (c) not going bankrupt doing it.
   The build order attacks those three before any nice-to-have.
2. **Every run costs real money → credits and sandbox are present from the first execution,**
   even before the full billing UI exists. A run that doesn't first place a credit hold is a bug.
3. **The execution backend is a separate service from the web app.** GPU code, compilers, and
   profilers live in Python containers; the product app stays a normal web stack. They talk over
   a queue + signed result callbacks.
4. **Measurement correctness is a product feature, not an implementation detail.** §4 gets its
   own hardening phase and its own test suite (known kernels with known performance envelopes).

---

## 2. High-level architecture

```
                            ┌─────────────────────────────────────────┐
                            │              Browser (SPA)               │
                            │  Next.js + React + Monaco editor         │
                            │  results/charts, GPU picker, compare view│
                            └───────────────┬─────────────────────────┘
                                            │ tRPC / REST (HTTPS, auth)
                                            ▼
            ┌───────────────────────────────────────────────────────────────┐
            │                     Web / API service (Next.js)               │
            │  auth · workspaces · kernels CRUD · run orchestration         │
            │  credit ledger · quota checks · share links · billing (Stripe)│
            └───┬───────────────┬───────────────────────┬──────────────────┘
                │               │                       │
       ┌────────▼──────┐ ┌──────▼────────┐     ┌────────▼─────────┐
       │  PostgreSQL   │ │  Redis        │     │ Object storage   │
       │ users,kernels,│ │ rate limits,  │     │ (S3 / R2):       │
       │ runs, credits,│ │ job status,   │     │ source artifacts,│
       │ comparisons,  │ │ credit holds, │     │ logs, profiles,  │
       │ billing ledger│ │ queue signals │     │ result blobs     │
       └───────────────┘ └──────┬────────┘     └──────────────────┘
                                 │ enqueue run jobs (1 per GPU for compare)
                                 ▼
            ┌───────────────────────────────────────────────────────────────┐
            │         Execution backend  (Modal — serverless GPU)           │
            │  per-run sandbox: compile (nvcc/triton) → run → benchmark      │
            │  warmup · CUDA-event timing · L2 flush · ncu metrics           │
            │  returns structured JSON + logs; signed callback to API        │
            │  one isolated container per run; warm pool for hot GPUs        │
            └───────────────────────────────────────────────────────────────┘
```

**Why this shape:** the web app never touches a GPU or untrusted code directly. It places a
**credit hold**, fans out **one job per GPU** to the execution backend, each job runs in an
isolated sandbox, results stream back, the API aggregates them into a comparison and **settles
the credit hold** against actual GPU-seconds used.

---

## 3. Tech stack (with the reasoning)

| Layer | Choice | Why / alternatives considered |
|---|---|---|
| **Frontend** | **Next.js (App Router) + React + TypeScript**, Tailwind, shadcn/ui | One framework for UI + API; SSR for share pages/SEO. |
| **Editor** | **Monaco** | Same engine as VS Code; CUDA/C++ highlighting, Vim mode via plugin. |
| **Charts** | **Recharts / visx** | Comparison tables, roofline, scaling curves. |
| **API layer** | **tRPC** (typed) + thin REST for public API/CLI | End-to-end types with the Next frontend; REST surface for §10 later. |
| **DB** | **PostgreSQL** + **Prisma** | Relational data (users, runs, ledger). Prisma migrations. |
| **Cache/queue signal** | **Redis** | Rate limits, credit holds, job status, idempotency keys. |
| **Object storage** | **Cloudflare R2** (or S3) | Source blobs, logs, profiler output. R2 = no egress fees. |
| **Auth** | **Auth.js (NextAuth)** — GitHub/Google/email | Cheap, self-hosted; Clerk if we want managed + orgs sooner. |
| **Billing** | **Stripe** (Checkout + metered usage) + own credit ledger in Postgres | Stripe for money movement; **we keep the source-of-truth credit ledger** ourselves. |
| **GPU execution** | **Modal** (serverless GPUs) | **Key choice — see §4 below.** Per-run sandbox, fast cold start, GPU selection (T4→B200), usage billing. |
| **Benchmark harness** | **Python** package (`nvcc`/`triton`/`cupy`, CUDA events, `ncu`) running inside Modal | The measurement logic; shared by every run. |
| **Infra/CI** | Vercel (web) **or** Fly/Render for the API container; GitHub Actions CI; Terraform for cloud bits | Web app can be Vercel; long-running orchestration on a container host. |
| **Observability** | OpenTelemetry → Grafana/Datadog; per-run cost metrics | §11 requires cost + utilization dashboards. |

**Language split:** TypeScript for web/API, **Python for the execution + benchmark harness.**
Don't fight the GPU ecosystem — it's Python.

---

## 4. The one critical decision: Modal vs RunPod

You mentioned RunPod. Here is the honest tradeoff for *this* product:

- **A per-run playground needs fast, isolated, ephemeral GPU execution.** Modal is serverless:
  sub-second-to-seconds cold starts, one sandboxed container per run, GPU type as a parameter,
  billed per second. That maps 1:1 onto "user clicks Run → spin a sandbox → run → tear down."
- **RunPod is rent-a-pod.** Great $/GPU-hr, but a naive "spin a pod per run" is slow (minutes)
  and you pay for idle. RunPod shines once you have steady load and run your **own warm pool**.

**Plan:** Build on **Modal first** (fastest path, sandbox + multi-GPU built in). Keep the
execution backend behind an interface (`ExecutionProvider`) so a **RunPod warm-pool provider**
can be added later purely as a cost optimization once volume justifies it. Don't couple the
product to either vendor.

---

## 5. Run lifecycle (the heart of §3 + §8 + §11)

This sequence is where correctness, money, and safety all meet:

```
1. User clicks Run / Compare  (selects 1..N GPUs)
2. API: auth + quota check + ESTIMATE cost  → place CREDIT HOLD (Redis + ledger row)
        reject early if insufficient credits / over spend cap
3. API: create Run + N RunTargets (one per GPU), enqueue N jobs (idempotency key per target)
4. Execution backend (per job, isolated sandbox):
        a. fetch source from object storage
        b. compile (nvcc/triton) with pinned toolkit  → on error, return compile diagnostics
        c. correctness check vs reference (optional)
        d. benchmark: warmup → L2 flush → N timed iters (CUDA events) → stats
        e. optional ncu metrics pass
        f. upload logs/profile; signed callback to API with results + GPU-seconds used
5. API: aggregate RunTargets → Comparison (table, charts, perf/$, recommendation)
6. API: SETTLE credit hold against ACTUAL GPU-seconds (refund or extra-charge the diff)
7. Stream status to browser throughout (Redis pub/sub → SSE/websocket)
```

**Failure handling:** any target can fail independently (compile error, timeout, OOM) without
sinking the comparison; failed targets release their portion of the hold. Hard per-target
timeout and output caps enforced in the sandbox (§11).

---

## 6. Data model (initial sketch)

```
User(id, email, auth_provider, created_at)
Workspace(id, owner_id, name)                         -- personal/team
Kernel(id, workspace_id, language, name, visibility)  -- cuda|triton|mojo
KernelFile(id, kernel_id, path, blob_ref)             -- source in object storage
KernelVersion(id, kernel_id, snapshot_ref, created_at)

Run(id, kernel_version_id, user_id, type, status, created_at)   -- type: single|compare
RunTarget(id, run_id, gpu_type, status, gpu_seconds,
          metrics_json, log_ref, profile_ref)         -- one per GPU
Comparison(id, run_id, summary_json, recommendation, share_slug, visibility)

-- Billing / credits (source of truth lives here, not in Stripe)
CreditAccount(id, owner_id, balance)
CreditTxn(id, account_id, kind, amount, run_id, created_at)  -- hold|settle|topup|refund
Plan(id, name, monthly_credits, allowed_gpus, limits_json)
Subscription(id, account_id, plan_id, stripe_ref, status)

GpuType(id, name, arch, mem_gb, bandwidth, fp16_tflops, price_per_sec, tier)
```

---

## 7. Build order (phased, hard parts first)

> Not an external "MVP" — this is the internal sequence so the riskiest pieces are proven
> before polish is layered on. §8 and §11 appear in **Phase 1**, not at the end.

### Phase 0 — Foundations & the execution spike
- Repo/monorepo (web + execution backend), CI, env/secrets, Postgres + Redis + R2 provisioned
- Auth.js login, basic workspace + kernel CRUD, Monaco editor saving source to R2
- **Spike: a single Modal function that compiles + runs a CUDA kernel on a chosen GPU and
  returns stdout.** Proves the whole execution path end-to-end before anything is built on it.

### Phase 1 — Safe single-GPU run pipeline  (§2 + §11 + credit skeleton from §8)
- Full run lifecycle for **one** GPU: editor → enqueue → sandbox compile/run → stream output
- **Sandbox hardening (§11):** isolation, no network egress, hard timeout, mem/output caps,
  kill-on-overrun, per-run logs
- **Credit skeleton (§8):** credit ledger + **hold/settle on every run** (even if top-ups are
  manual for now). No run executes without a hold. This is the anti-bankruptcy guardrail.
- GPU catalog (§9) seeded with specs + price/sec

### Phase 2 — Benchmarking rigor  (§4) — *the moat*
- Benchmark harness: warmup, L2 flush, CUDA-event timing, N iters, median/min/p95/stddev
- Throughput/bandwidth/occupancy/register/shared-mem extraction
- Triton autotune separation (compile/autotune vs run time); throttling/clock detection
- **Validation suite:** known kernels (vector add, matmul, reduction) with expected performance
  envelopes per GPU → catches measurement regressions. Trust is the product here.

### Phase 3 — Cross-GPU comparison  (§3) — *the wedge*
- Fan-out one job per selected GPU; aggregate into a Comparison
- Comparison UI: side-by-side metrics table, speedup chart, roofline, **perf/$ + "best GPU"**
- Input-size sweep (scaling curves per GPU)
- Shareable comparison report (§6 minimal: public/unlisted slug)
- **Compare gated as premium** (N× cost) via the credit system

### Phase 4 — Billing & quotas, productized  (§8)
- Stripe Checkout + metered top-ups; plans (free tier = T4/L4 capped); subscription mgmt
- Usage dashboard, per-user/org spend caps, rate limiting, abuse detection
- Idempotent reconciliation between credit ledger and Stripe

### Phase 5 — Accounts, sharing, persistence polish  (§6 + §7)
- Version history, fork, run history, kernel library search/tags
- Teams/orgs + shared credit pool + roles
- Embeddable result widget, JSON/CSV export

### Phase 6+ — Deferred / additive
- §5 deep profiling (ncu/PTX/SASS viewer, Nsight timeline)
- §10 public REST API + CLI + GitHub Action (CI for kernels)
- §12 community gallery + optional leaderboard/challenge mode
- AMD/ROCm + Mojo runtimes; RunPod warm-pool provider as cost optimization

---

## 8. Cross-cutting concerns to get right early
- **Idempotency** on every run/job (network retries must not double-charge or double-run).
- **Cost attribution** per run from day one (GPU-seconds × price) → feeds §3 perf/$ *and* §8.
- **Abuse/fair-use:** per-run resource caps, crypto-mining heuristics, global concurrency cap
  per free user (your biggest cost leak is free users looping expensive kernels).
- **Reproducibility:** pin and surface toolkit/driver versions per environment.

---

## 9. Open decisions for you
1. **Languages at launch:** CUDA + Triton only (recommended), or include Mojo / AMD ROCm now?
2. **Free tier generosity:** which GPUs free, and how many runs/month before it costs you too much?
3. **Web host:** Vercel for the app + separate container host for orchestration, or all on one
   container host (Fly/Render)?
4. **Auth:** self-hosted Auth.js (cheaper) vs Clerk (faster orgs/teams)?
5. **Name + domain.**

---

*Next deliverable (when you're ready): a Phase 0 + Phase 1 task breakdown with concrete tickets,
the `ExecutionProvider` interface definition, and the initial Prisma schema + Modal harness stubs.*
