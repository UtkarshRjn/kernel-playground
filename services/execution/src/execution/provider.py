"""ExecutionProvider abstraction (Python side) + a mock for local dev and tests.

Mirrors the TS ExecutionProvider in packages/shared. The Modal-backed provider lands in
Phase 1; MockProvider lets the API and harness be developed without burning GPU credits.
"""

from __future__ import annotations

import abc

from .benchmark import run_benchmark
from .contracts import RunRequest, RunResult, RunStatus


class ExecutionProvider(abc.ABC):
    """Seam between the orchestration API and the GPU backend."""

    name: str

    @abc.abstractmethod
    def run(self, request: RunRequest) -> RunResult:
        """Execute one (kernel, GPU) target. Failures are reported via RunResult.status."""

    @abc.abstractmethod
    def cancel(self, target_id: str) -> None:
        """Best-effort cancellation of an in-flight target."""


class MockProvider(ExecutionProvider):
    """Deterministic, GPU-free provider.

    Produces stable, plausible timings keyed off the GPU + iteration index so that
    end-to-end API flows (queue, aggregate, settle credits) can be exercised offline.
    """

    name = "mock"

    # Relative speed factors; smaller = faster. Rough, for dev only.
    _SPEED: dict[str, float] = {
        "T4": 4.0,
        "L4": 2.6,
        "A10": 2.2,
        "A100_40GB": 1.4,
        "A100_80GB": 1.3,
        "H100": 1.0,
        "H200": 0.9,
        "B200": 0.6,
    }

    def run(self, request: RunRequest) -> RunResult:
        base = self._SPEED.get(request.gpu.value, 1.0)
        # Deterministic, slightly varying samples without RNG.
        def measure_ms() -> float:
            measure_ms.i += 1  # type: ignore[attr-defined]
            return base * (1.0 + 0.01 * (measure_ms.i % 5))  # type: ignore[attr-defined]

        measure_ms.i = 0  # type: ignore[attr-defined]
        stats = run_benchmark(measure_ms, request.benchmark)
        gpu_seconds = (stats.mean_ms / 1000.0) * request.benchmark.timed_iters
        return RunResult(
            run_id=request.run_id,
            target_id=request.target_id,
            gpu=request.gpu,
            status=RunStatus.SUCCEEDED,
            gpu_seconds=gpu_seconds,
            stats=stats,
            metrics=None,
            stdout=f"[mock] ran {request.entry_point} on {request.gpu.value}\n",
        )

    def cancel(self, target_id: str) -> None:  # noqa: D102
        return None
