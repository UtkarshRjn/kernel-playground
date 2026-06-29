from execution.contracts import (
    BenchmarkStats,
    GpuType,
    KernelLanguage,
    RunResult,
    RunStatus,
)
from execution.wire import request_from_json, result_to_json


def sample_request_json() -> dict:
    return {
        "runId": "run_1",
        "targetId": "run_1:T4",
        "idempotencyKey": "run_1:T4",
        "language": "cuda",
        "gpu": "T4",
        "files": [{"path": "kernel.cu", "content": "// code"}],
        "entryPoint": "kp_run",
        "compilerFlags": ["-lcublas"],
        "benchmark": {"warmupIters": 5, "timedIters": 20, "flushL2": True, "timeoutSec": 30},
    }


def test_request_from_json_maps_all_fields() -> None:
    req = request_from_json(sample_request_json())
    assert req.run_id == "run_1"
    assert req.language is KernelLanguage.CUDA
    assert req.gpu is GpuType.T4
    assert req.files[0].path == "kernel.cu"
    assert req.compiler_flags == ["-lcublas"]
    assert req.benchmark.timed_iters == 20
    assert req.benchmark.flush_l2 is True


def test_result_to_json_round_trips_shape() -> None:
    result = RunResult(
        run_id="run_1",
        target_id="run_1:T4",
        gpu=GpuType.T4,
        status=RunStatus.SUCCEEDED,
        gpu_seconds=4.2,
        stats=BenchmarkStats(
            mean_ms=1.0, median_ms=0.9, min_ms=0.8, p95_ms=1.1, stddev_ms=0.05, iters=20
        ),
    )
    j = result_to_json(result)
    assert j["gpu"] == "T4"
    assert j["status"] == "succeeded"
    assert j["stats"]["medianMs"] == 0.9
    assert j["metrics"] is None


def test_result_to_json_handles_no_stats() -> None:
    result = RunResult(
        run_id="r",
        target_id="r:T4",
        gpu=GpuType.T4,
        status=RunStatus.COMPILE_ERROR,
        gpu_seconds=0.5,
        diagnostics="nvcc: error",
    )
    j = result_to_json(result)
    assert j["stats"] is None
    assert j["diagnostics"] == "nvcc: error"
