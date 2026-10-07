from pathlib import Path

import pytest

from execution.contracts import (
    BenchmarkConfig,
    GpuType,
    KernelFile,
    KernelLanguage,
    RunRequest,
    RunResult,
    RunStatus,
)
from execution.cuda_runner import _materialize
from execution.limits import (
    MAX_FILE_CHARS,
    MAX_FILES,
    MAX_OUTPUT_CHARS,
    MAX_PATH_CHARS,
    MAX_TIMED_ITERS,
    MAX_WARMUP_ITERS,
    safe_join,
    truncate_output,
    validate_path,
)


def _req(files: list[KernelFile]) -> RunRequest:
    return RunRequest(
        run_id="r",
        target_id="r:T4",
        idempotency_key="r:T4",
        language=KernelLanguage.CUDA,
        gpu=GpuType.T4,
        files=files,
        entry_point="kp_run",
        benchmark=BenchmarkConfig(),
    )


def test_truncate_output_leaves_short_text_alone() -> None:
    assert truncate_output("hello", limit=10) == "hello"
    assert truncate_output("x" * 10, limit=10) == "x" * 10


def test_truncate_output_caps_length_and_marks_it() -> None:
    out = truncate_output("x" * 1000, limit=100)
    assert len(out) <= 100
    assert out.startswith("x")
    assert "truncated; 1000 chars total" in out


def test_run_result_caps_all_output_fields() -> None:
    big = "y" * (MAX_OUTPUT_CHARS * 3)
    res = RunResult(
        run_id="r",
        target_id="r:T4",
        gpu=GpuType.T4,
        status=RunStatus.RUNTIME_ERROR,
        gpu_seconds=1.0,
        stdout=big,
        stderr=big,
        diagnostics=big,
    )
    assert len(res.stdout) <= MAX_OUTPUT_CHARS
    assert len(res.stderr) <= MAX_OUTPUT_CHARS
    assert res.diagnostics is not None and len(res.diagnostics) <= MAX_OUTPUT_CHARS


def test_run_result_keeps_none_diagnostics() -> None:
    res = RunResult(
        run_id="r", target_id="r:T4", gpu=GpuType.T4, status=RunStatus.SUCCEEDED, gpu_seconds=0
    )
    assert res.diagnostics is None


@pytest.mark.parametrize(
    "path", ["kernel.cu", "kernel.py", "src/util.cuh", "a/b/c_d-e.1.h", "_private.py"]
)
def test_validate_path_accepts_simple_relative_paths(path: str) -> None:
    validate_path(path)


@pytest.mark.parametrize(
    "path",
    [
        "",
        "/etc/passwd",
        "../escape.cu",
        "a/../../escape.cu",
        "a/./b.cu",
        "..",
        ".bashrc",
        "a//b.cu",
        "a/",
        "a\\b.cu",
        "C:\\x.cu",
        "nul\x00.cu",
        "space name.cu",
        "x" * (MAX_PATH_CHARS + 1),
    ],
)
def test_validate_path_rejects_unsafe_paths(path: str) -> None:
    with pytest.raises(ValueError):
        validate_path(path)


def test_kernel_file_rejects_traversal() -> None:
    with pytest.raises(ValueError):
        KernelFile("../../tmp/pwn.cu", "// x")


def test_kernel_file_rejects_oversized_content() -> None:
    KernelFile("kernel.cu", "x" * MAX_FILE_CHARS)
    with pytest.raises(ValueError):
        KernelFile("kernel.cu", "x" * (MAX_FILE_CHARS + 1))


def test_run_request_rejects_too_many_files() -> None:
    files = [KernelFile(f"f{i}.cu", "") for i in range(MAX_FILES + 1)]
    with pytest.raises(ValueError):
        _req(files)


def test_benchmark_config_iteration_caps() -> None:
    BenchmarkConfig(warmup_iters=MAX_WARMUP_ITERS, timed_iters=MAX_TIMED_ITERS)
    with pytest.raises(ValueError):
        BenchmarkConfig(warmup_iters=MAX_WARMUP_ITERS + 1)
    with pytest.raises(ValueError):
        BenchmarkConfig(timed_iters=MAX_TIMED_ITERS + 1)


def test_safe_join_stays_inside_workdir(tmp_path: Path) -> None:
    assert safe_join(tmp_path, "a/b.cu") == (tmp_path / "a" / "b.cu").resolve()
    with pytest.raises(ValueError):
        safe_join(tmp_path, "../b.cu")


def test_safe_join_refuses_symlink_escape(tmp_path: Path) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    work = tmp_path / "work"
    work.mkdir()
    (work / "link").symlink_to(outside, target_is_directory=True)
    with pytest.raises(ValueError):
        safe_join(work, "link/x.cu")


def test_materialize_writes_inside_workdir(tmp_path: Path) -> None:
    req = _req([KernelFile("src/kernel.cu", "// k"), KernelFile("inc/util.cuh", "// u")])
    names = _materialize(req, tmp_path)
    assert names == ["src/kernel.cu", "kp_main.cu"]
    assert (tmp_path / "src" / "kernel.cu").read_text() == "// k"
    assert (tmp_path / "inc" / "util.cuh").exists()
