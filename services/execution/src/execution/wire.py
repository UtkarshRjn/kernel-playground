"""JSON wire format between the TS API and the Python execution endpoint.

The consumer is TypeScript, so the wire shape is camelCase and matches packages/shared.
These helpers are pure (dict <-> dataclass) and unit-tested without a GPU.
"""

from __future__ import annotations

from typing import Any

from .contracts import (
    BenchmarkConfig,
    GpuType,
    KernelFile,
    KernelLanguage,
    RunRequest,
    RunResult,
)


def request_from_json(d: dict[str, Any]) -> RunRequest:
    b = d["benchmark"]
    return RunRequest(
        run_id=d["runId"],
        target_id=d["targetId"],
        idempotency_key=d["idempotencyKey"],
        language=KernelLanguage(d["language"]),
        gpu=GpuType(d["gpu"]),
        files=[KernelFile(path=f["path"], content=f["content"]) for f in d["files"]],
        entry_point=d["entryPoint"],
        compiler_flags=list(d.get("compilerFlags", [])),
        benchmark=BenchmarkConfig(
            warmup_iters=int(b["warmupIters"]),
            timed_iters=int(b["timedIters"]),
            flush_l2=bool(b["flushL2"]),
            timeout_sec=int(b["timeoutSec"]),
        ),
    )


def result_to_json(r: RunResult) -> dict[str, Any]:
    stats = None
    if r.stats is not None:
        stats = {
            "meanMs": r.stats.mean_ms,
            "medianMs": r.stats.median_ms,
            "minMs": r.stats.min_ms,
            "p95Ms": r.stats.p95_ms,
            "stddevMs": r.stats.stddev_ms,
            "iters": r.stats.iters,
        }
    metrics = None
    if r.metrics is not None:
        metrics = {
            "throughputGflops": r.metrics.throughput_gflops,
            "achievedBandwidthGbs": r.metrics.achieved_bandwidth_gbs,
            "occupancyPct": r.metrics.occupancy_pct,
            "registersPerThread": r.metrics.registers_per_thread,
            "sharedMemBytes": r.metrics.shared_mem_bytes,
        }
    return {
        "runId": r.run_id,
        "targetId": r.target_id,
        "gpu": r.gpu.value,
        "status": r.status.value,
        "gpuSeconds": r.gpu_seconds,
        "stats": stats,
        "metrics": metrics,
        "stdout": r.stdout,
        "stderr": r.stderr,
        "diagnostics": r.diagnostics,
    }
