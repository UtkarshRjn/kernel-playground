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

## Design notes
- Every provider must honor `RunRequest.idempotency_key` and never double-execute it.
- Failures are reported via `RunResult.status`, not exceptions (infra errors excepted).
- Statistics live here, separate from device code, so measurement correctness is testable.
