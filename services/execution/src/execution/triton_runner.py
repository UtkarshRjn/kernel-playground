"""Compile + run + benchmark a Triton submission (§2/§4).

Triton kernels are Python, so timing is done with torch CUDA events here rather than the
injected C++ driver used for CUDA. Same rigor: warmup (which also absorbs Triton's JIT
compile), L2-cache flush between iterations, event timing, and median/p95/stddev.

`load_entry` is pure (no torch) so it's unit-tested without a GPU; `run_triton` does the
torch-side timing on a GPU host.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from .benchmark import summarize
from .contracts import RunRequest, RunResult, RunStatus

# Contract: a Triton submission defines kp_run() (one iteration) and optional kp_setup()
# (one-time allocation). Both are module-level and parameterless, mirroring the CUDA
# contract — kp_setup populates module globals that kp_run reads.
EntryFns = tuple[Callable[[], Any], Callable[[], Any] | None]


def load_entry(source: str, path: str) -> EntryFns:
    """Execute submission source and return (kp_run, kp_setup). Raises if kp_run is absent."""
    namespace: dict[str, Any] = {}
    exec(compile(source, path, "exec"), namespace)  # noqa: S102 - sandboxed on Modal
    kp_run = namespace.get("kp_run")
    if not callable(kp_run):
        raise ValueError("Triton submission must define a callable kp_run()")
    kp_setup = namespace.get("kp_setup")
    return kp_run, (kp_setup if callable(kp_setup) else None)


def _entry_source(request: RunRequest) -> tuple[str, str]:
    """Pick the entry .py file (single file, or one named kernel.py)."""
    py_files = [f for f in request.files if f.path.endswith(".py")]
    if not py_files:
        raise ValueError("Triton submission must include a .py file")
    chosen = next((f for f in py_files if Path(f.path).name == "kernel.py"), py_files[0])
    return chosen.content, chosen.path


def run_triton(request: RunRequest, workdir: Path) -> RunResult:
    """Run + benchmark a Triton submission on a GPU host using torch CUDA events."""
    started = time.monotonic()

    def result(status: RunStatus, **kw: object) -> RunResult:
        return RunResult(
            run_id=request.run_id,
            target_id=request.target_id,
            gpu=request.gpu,
            status=status,
            gpu_seconds=time.monotonic() - started,
            **kw,  # type: ignore[arg-type]
        )

    # Make sibling files importable, then load the entry module.
    import sys

    for f in request.files:
        (workdir / f.path).parent.mkdir(parents=True, exist_ok=True)
        (workdir / f.path).write_text(f.content)
    sys.path.insert(0, str(workdir))

    try:
        source, path = _entry_source(request)
        kp_run, kp_setup = load_entry(source, path)
    except Exception as e:  # noqa: BLE001 - surface load/compile failure to the user
        return result(RunStatus.COMPILE_ERROR, diagnostics=str(e))

    import torch  # imported here so the module loads GPU-free

    try:
        if kp_setup is not None:
            kp_setup()

        # Warmup also triggers Triton's JIT compile so it isn't counted in the timing.
        for _ in range(request.benchmark.warmup_iters):
            kp_run()
        torch.cuda.synchronize()

        flush_buf = (
            torch.empty(256 * 1024 * 1024 // 4, dtype=torch.float32, device="cuda")
            if request.benchmark.flush_l2
            else None
        )
        start = torch.cuda.Event(enable_timing=True)
        end = torch.cuda.Event(enable_timing=True)
        samples: list[float] = []
        for _ in range(request.benchmark.timed_iters):
            if flush_buf is not None:
                flush_buf.zero_()
            start.record()
            kp_run()
            end.record()
            torch.cuda.synchronize()
            samples.append(start.elapsed_time(end))
    except Exception as e:  # noqa: BLE001 - runtime failure in the kernel
        return result(RunStatus.RUNTIME_ERROR, diagnostics=str(e))

    return result(RunStatus.SUCCEEDED, stats=summarize(samples))
