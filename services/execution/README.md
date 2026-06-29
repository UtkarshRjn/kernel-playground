# Execution backend

GPU execution + benchmark backend for Kernel Playground. Runs on **Modal** (serverless
GPUs) in production; the core harness is pure-Python and runs without a GPU for tests.

## Layout
- `src/execution/contracts.py` — Python mirror of `packages/shared` (run requests/results).
- `src/execution/benchmark.py` — benchmark statistics + warmup/timed orchestration (§4).
- `src/execution/provider.py` — `ExecutionProvider` ABC + `MockProvider` (GPU-free dev).
- `src/execution/modal_app.py` — Modal app skeleton + GPU mapping (real run logic: Phase 1).

## Develop
```bash
cd services/execution
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest -q
ruff check .
mypy
```

The harness core has no runtime dependencies. `modal`, `torch`, and `triton` install only
in the GPU image (`pip install -e ".[modal]"`) and are import-guarded.

## CUDA submission contract

A CUDA submission defines `extern "C"` hooks; the injected driver (`harness/kp_main.cu`)
owns the timing so measurements are trustworthy:

```cpp
extern "C" void kp_setup();     // optional: one-time allocation (not timed)
extern "C" void kp_run();       // required: one iteration (kernel launch)
extern "C" void kp_teardown();  // optional: cleanup
```

The driver does warmup, L2-cache flush, CUDA-event timing, and emits per-iteration
samples as a `KP_RESULT {...}` JSON line that `cuda_runner.py` aggregates.

## Run on a real GPU (Modal)

```bash
pip install -e ".[modal,dev]"
modal setup                          # one-time browser auth
modal run -m execution.modal_app     # compile + benchmark vector_add on T4
modal run -m execution.modal_app --gpu A100_80GB   # any catalog GPU
```

Verified on T4: vector-add ~0.198 ms median, stddev ~0.0006 ms over 50 iters.

## Design notes
- Every provider must honor `RunRequest.idempotency_key` and never double-execute it.
- Failures are reported via `RunResult.status`, not exceptions (infra errors excepted).
- Statistics live here, separate from device code, so measurement correctness is testable.
