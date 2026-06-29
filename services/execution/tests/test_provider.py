import pytest

from execution.contracts import (
    BenchmarkConfig,
    GpuType,
    KernelFile,
    KernelLanguage,
    RunRequest,
    RunStatus,
)
from execution.provider import MockProvider


def make_request(gpu: GpuType) -> RunRequest:
    return RunRequest(
        run_id="run_1",
        target_id=f"tgt_{gpu.value}",
        idempotency_key=f"key_{gpu.value}",
        language=KernelLanguage.CUDA,
        gpu=gpu,
        files=[KernelFile(path="kernel.cu", content="// noop")],
        entry_point="main",
        benchmark=BenchmarkConfig(warmup_iters=2, timed_iters=20),
    )


def test_mock_provider_succeeds_and_reports_cost() -> None:
    provider = MockProvider()
    result = provider.run(make_request(GpuType.A100_80GB))
    assert result.status is RunStatus.SUCCEEDED
    assert result.stats is not None
    assert result.stats.iters == 20
    assert result.gpu_seconds > 0


def test_faster_gpu_reports_lower_runtime() -> None:
    provider = MockProvider()
    slow = provider.run(make_request(GpuType.T4))
    fast = provider.run(make_request(GpuType.B200))
    assert slow.stats is not None and fast.stats is not None
    assert fast.stats.mean_ms < slow.stats.mean_ms


def test_invalid_benchmark_config_rejected() -> None:
    with pytest.raises(ValueError):
        BenchmarkConfig(timed_iters=0)
