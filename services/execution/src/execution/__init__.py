"""Kernel Playground GPU execution + benchmark backend."""

from .benchmark import percentile, run_benchmark, summarize
from .contracts import (
    BenchmarkConfig,
    BenchmarkStats,
    GpuType,
    KernelFile,
    KernelLanguage,
    KernelMetrics,
    RunRequest,
    RunResult,
    RunStatus,
)
from .provider import ExecutionProvider, MockProvider

__all__ = [
    "BenchmarkConfig",
    "BenchmarkStats",
    "ExecutionProvider",
    "GpuType",
    "KernelFile",
    "KernelLanguage",
    "KernelMetrics",
    "MockProvider",
    "RunRequest",
    "RunResult",
    "RunStatus",
    "percentile",
    "run_benchmark",
    "summarize",
]
