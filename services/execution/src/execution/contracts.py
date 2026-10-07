"""Execution contracts — the Python mirror of packages/shared (TS).

Kept dependency-free (stdlib dataclasses + enums) so the harness core runs and tests
without pydantic/torch/modal. Field names match the TS schema in packages/shared.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from .limits import (
    MAX_FILE_CHARS,
    MAX_FILES,
    MAX_TIMED_ITERS,
    MAX_WARMUP_ITERS,
    truncate_output,
    validate_path,
)


class GpuType(StrEnum):
    T4 = "T4"
    L4 = "L4"
    A10 = "A10"
    A100_40GB = "A100_40GB"
    A100_80GB = "A100_80GB"
    H100 = "H100"
    H200 = "H200"
    B200 = "B200"


class KernelLanguage(StrEnum):
    CUDA = "cuda"
    TRITON = "triton"


class RunStatus(StrEnum):
    QUEUED = "queued"
    COMPILING = "compiling"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    COMPILE_ERROR = "compile_error"
    RUNTIME_ERROR = "runtime_error"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


@dataclass(frozen=True)
class KernelFile:
    path: str
    content: str

    def __post_init__(self) -> None:
        validate_path(self.path)
        if len(self.content) > MAX_FILE_CHARS:
            raise ValueError(f"{self.path} exceeds {MAX_FILE_CHARS} characters")


@dataclass(frozen=True)
class BenchmarkConfig:
    warmup_iters: int = 10
    timed_iters: int = 50
    flush_l2: bool = True
    timeout_sec: int = 60

    def __post_init__(self) -> None:
        if not (0 <= self.warmup_iters <= MAX_WARMUP_ITERS):
            raise ValueError(f"warmup_iters must be in [0, {MAX_WARMUP_ITERS}]")
        if not (1 <= self.timed_iters <= MAX_TIMED_ITERS):
            raise ValueError(f"timed_iters must be in [1, {MAX_TIMED_ITERS}]")
        if not (1 <= self.timeout_sec <= 300):
            raise ValueError("timeout_sec must be in [1, 300]")


@dataclass(frozen=True)
class RunRequest:
    run_id: str
    target_id: str
    idempotency_key: str
    language: KernelLanguage
    gpu: GpuType
    files: list[KernelFile]
    entry_point: str
    benchmark: BenchmarkConfig
    compiler_flags: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.files:
            raise ValueError("at least one kernel file is required")
        if len(self.files) > MAX_FILES:
            raise ValueError(f"at most {MAX_FILES} kernel files are allowed")
        if not self.entry_point:
            raise ValueError("entry_point is required")


@dataclass(frozen=True)
class BenchmarkStats:
    mean_ms: float
    median_ms: float
    min_ms: float
    p95_ms: float
    stddev_ms: float
    iters: int


@dataclass(frozen=True)
class KernelMetrics:
    throughput_gflops: float | None = None
    achieved_bandwidth_gbs: float | None = None
    occupancy_pct: float | None = None
    registers_per_thread: int | None = None
    shared_mem_bytes: int | None = None


@dataclass(frozen=True)
class RunResult:
    run_id: str
    target_id: str
    gpu: GpuType
    status: RunStatus
    gpu_seconds: float
    stats: BenchmarkStats | None = None
    metrics: KernelMetrics | None = None
    stdout: str = ""
    stderr: str = ""
    diagnostics: str | None = None

    def __post_init__(self) -> None:
        # Output comes from untrusted code; cap it so one run can't bloat the wire or the DB.
        object.__setattr__(self, "stdout", truncate_output(self.stdout))
        object.__setattr__(self, "stderr", truncate_output(self.stderr))
        if self.diagnostics is not None:
            object.__setattr__(self, "diagnostics", truncate_output(self.diagnostics))
