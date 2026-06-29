"""The benchmark harness core (§4) — pure and GPU-free so it is unit-testable.

The actual GPU timing (CUDA events, L2 flush) lives in the Modal worker and feeds raw
per-iteration samples into ``summarize``. Keeping the statistics here, separated from the
device code, is what lets us pin down measurement correctness with a test suite.
"""

from __future__ import annotations

import statistics
from collections.abc import Callable

from .contracts import BenchmarkConfig, BenchmarkStats


def percentile(samples: list[float], pct: float) -> float:
    """Linear-interpolated percentile. ``pct`` in [0, 100]."""
    if not samples:
        raise ValueError("samples must be non-empty")
    if not 0 <= pct <= 100:
        raise ValueError("pct must be in [0, 100]")
    ordered = sorted(samples)
    if len(ordered) == 1:
        return ordered[0]
    rank = (pct / 100) * (len(ordered) - 1)
    lo = int(rank)
    hi = min(lo + 1, len(ordered) - 1)
    frac = rank - lo
    return ordered[lo] + (ordered[hi] - ordered[lo]) * frac


def summarize(samples_ms: list[float]) -> BenchmarkStats:
    """Aggregate raw per-iteration timings into the stats shown in the UI."""
    if not samples_ms:
        raise ValueError("samples_ms must be non-empty")
    return BenchmarkStats(
        mean_ms=statistics.fmean(samples_ms),
        median_ms=statistics.median(samples_ms),
        min_ms=min(samples_ms),
        p95_ms=percentile(samples_ms, 95),
        stddev_ms=statistics.stdev(samples_ms) if len(samples_ms) > 1 else 0.0,
        iters=len(samples_ms),
    )


def run_benchmark(measure_ms: Callable[[], float], config: BenchmarkConfig) -> BenchmarkStats:
    """Drive warmup + timed iterations against a ``measure_ms`` callable.

    ``measure_ms`` returns the elapsed milliseconds for one kernel invocation (in the
    real worker this wraps CUDA events + L2 flush). Injecting it keeps this orchestration
    testable with a deterministic fake.
    """
    for _ in range(config.warmup_iters):
        measure_ms()
    samples = [measure_ms() for _ in range(config.timed_iters)]
    return summarize(samples)
