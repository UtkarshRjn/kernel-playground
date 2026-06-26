# Feature Specification — Kernel Playground

> **Working name:** Kernel Playground (final name TBD)
> **One-liner:** "Colab for kernel code" — a zero-setup, browser-based playground where
> anyone can write GPU kernels and run the *same kernel across multiple GPUs* (T4, A100,
> B200, ...) to compare real performance and cost, side by side.
>
> **The wedge (what nobody else does well):** Sections **3** and **4** — cross-GPU
> comparison of *your own* kernel, with trustworthy benchmarking. Everything else exists
> to make that wedge usable and economically sustainable.

---

## Competitive context (why this exists)

| Product | What it does | Gap we fill |
|---|---|---|
| cuda.live | Browser CUDA playground | **T4 only**, no GPU choice, no comparison |
| LeetGPU | Playground + problems | Pick a GPU, but no side-by-side compare of your own kernel |
| Google Colab + nvcc4jupyter | Free GPU notebooks | One GPU per runtime, janky setup, no comparison |
| Tensara | LeetCode for kernels | Fixed problems + per-GPU leaderboards (per *user*, not your arbitrary kernel) |
| Compiler Explorer | Compile/inspect CUDA | No execution / benchmarking across GPUs |

**Demand status:** Browser kernel playgrounds are proven (many exist). Cross-GPU
comparison of your own kernel is *plausible and unserved* — that is the bet.

---

## 1. Code Authoring / Editor
- In-browser code editor (Monaco-based) with **CUDA C++, Triton, and Mojo** syntax highlighting
- Vim / Emacs keybindings, multi-cursor, find-replace
- Multi-file projects (kernel + host code + headers), file tree
- Templates / starter snippets per language (vector add, matmul, reduction, softmax, etc.)
- Autosave, local draft recovery, version history per file
- Compiler flag controls (arch/`-gencode`, `-O` level, fast-math, register caps)
- Inline compile errors mapped to line numbers (parse NVCC/Triton output)
- Optional AI assist: explain error, suggest fix, generate a kernel from a description

## 2. Execution Runtime
- One-click **Run** → compile + execute on a real GPU, stream stdout/stderr live
- **GPU selector** (pick T4 / L4 / A10 / A100 / H100 / H200 / B200, plus AMD MI300X if ROCm supported)
- Per-run hard timeout, memory cap, output size cap
- Custom input data: upload tensors / generate random with seed / define shapes
- Correctness check against a reference (PyTorch/NumPy) with tolerance
- Reproducible runs (pinned driver/CUDA/toolkit version per environment, shown to user)
- Run history per user, re-run any past execution

## 3. ⭐ Cross-GPU Comparison (the wedge)
- **Run the same kernel across N GPUs in one click** → single comparison view
- Side-by-side table: runtime, throughput (GFLOP/s), memory bandwidth (GB/s), occupancy, register/shared-mem usage per GPU
- **Cost-aware comparison**: $/run and perf-per-dollar for each GPU (from cloud cost) → answers "which GPU should I buy/rent"
- Normalized charts: speedup vs baseline GPU, roofline plot per GPU
- "Best GPU for this kernel" recommendation (perf, perf/$, and perf/watt)
- Save a comparison as a shareable report
- Compare across **input sizes** too (sweep shapes, show scaling curves per GPU)

## 4. ⭐ Benchmarking Rigor (the moat — must be trustworthy)
- Warmup runs + N timed iterations, report median/min/p95/stddev
- L2 cache flush between iterations
- CUDA event timing (not wall clock), proper device sync
- Clock-locking / report whether clocks were locked, throttling detection
- Statistical confidence (variance shown, flag noisy results)
- Triton autotune handling (separate compile/autotune time from run time)

## 5. Profiling & Deep Inspection
- Nsight Compute / `ncu`-style metrics: occupancy, warp stalls, memory throughput, instruction mix
- PTX / SASS assembly viewer (Compiler-Explorer style), diff PTX across GPU arches
- Register and shared-memory usage report, spill warnings
- Timeline / kernel trace (Nsight Systems-style) for multi-kernel runs
- Roofline analysis per GPU

## 6. Results, Visualization & Sharing
- Permanent shareable URL per run and per comparison (public/unlisted/private)
- Embeddable result widget (for blogs/docs)
- Export results (JSON / CSV / PNG charts)
- Side-by-side **diff of two kernel versions** on the same GPU (perf regression view)
- Fork someone's shared kernel into your own workspace

## 7. Accounts, Workspaces, Collaboration
- Auth (GitHub/Google/email)
- Personal workspace + saved kernels library, tags/search
- Teams/orgs: shared kernels, shared credit pool, roles
- Real-time or async collaboration on a kernel (comments at minimum)
- Public profile showing your shared kernels

## 8. Billing, Credits & Quotas  *(load-bearing — every click costs GPU money)*
- Credit system (1 run = N credits, scaled by GPU tier and duration)
- Free tier (limited GPUs, e.g. T4/L4, capped runs/month)
- Paid tiers + pay-as-you-go top-ups
- Cross-GPU compare gated as premium (since it's N× cost)
- Per-user/org spend caps, usage dashboard, abuse/rate limiting
- Billing integration (Stripe), invoices

## 9. GPU / Environment Catalog
- Curated GPU list with specs (memory, bandwidth, FP16/FP8 TFLOPS, arch, price/hr)
- Multiple CUDA toolkit versions selectable
- Pre-installed libs: cuBLAS, cuDNN, CUTLASS, Thrust, PyTorch, CuPy, Triton
- Clear "what's installed" manifest per environment

## 10. API, CLI & Integrations
- REST/GraphQL API: submit kernel, run, fetch results/benchmarks
- CLI tool (`run`, `bench`, `compare`) for local-editor users
- GitHub Action: benchmark a kernel on PR, comment perf table (CI for kernels)
- Webhooks for run completion

## 11. Sandboxing, Security & Ops  *(load-bearing — multi-tenant untrusted code)*
- Isolated per-run sandbox (no cross-tenant access), network egress controls
- Compile/run timeouts, resource limits, kill-on-overrun
- Queue + autoscaling of GPU workers (Modal serverless or RunPod pool)
- Cold-start mitigation (warm pool for popular GPUs)
- Observability: per-run logs, cost tracking, GPU utilization dashboards (internal)
- Fair-use / anti-crypto-mining detection

## 12. Community / Discovery  *(optional, strong retention)*
- Public gallery of shared kernels & comparisons ("fastest matmul on H100")
- Optional challenge/leaderboard mode (LeetCode-style, layered on)
- Discord/forum integration

---

## Scope notes
- **Items 3 and 4 are the product.** Build first, even though we are not shipping a thin "MVP."
- **Sections 8 and 11 are not optional polish.** For a product where every click costs real GPU money and runs untrusted code, billing/quotas and sandboxing are load-bearing from day one.
- **AMD/ROCm and Mojo (sections 2/9) are explicit scope decisions** — they widen appeal but multiply the runtime/testing surface. Default plan: **CUDA + Triton first**, ROCm/Mojo later.
