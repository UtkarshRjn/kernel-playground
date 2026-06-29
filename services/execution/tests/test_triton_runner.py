import pytest

from execution.contracts import (
    BenchmarkConfig,
    GpuType,
    KernelFile,
    KernelLanguage,
    RunRequest,
)
from execution.triton_runner import _entry_source, load_entry


def test_load_entry_finds_kp_run() -> None:
    run, setup = load_entry("def kp_run():\n    return 1\n", "k.py")
    assert callable(run)
    assert setup is None


def test_load_entry_with_setup() -> None:
    src = "def kp_setup():\n    pass\n\ndef kp_run():\n    pass\n"
    run, setup = load_entry(src, "k.py")
    assert callable(run)
    assert callable(setup)


def test_load_entry_missing_kp_run_raises() -> None:
    with pytest.raises(ValueError):
        load_entry("x = 1\n", "k.py")


def _req(files: list[KernelFile]) -> RunRequest:
    return RunRequest(
        run_id="r",
        target_id="r:T4",
        idempotency_key="r:T4",
        language=KernelLanguage.TRITON,
        gpu=GpuType.T4,
        files=files,
        entry_point="kp_run",
        benchmark=BenchmarkConfig(),
    )


def test_entry_source_prefers_kernel_py() -> None:
    req = _req([KernelFile("util.py", "# util"), KernelFile("kernel.py", "# main")])
    content, path = _entry_source(req)
    assert path == "kernel.py"
    assert content == "# main"


def test_entry_source_requires_python_file() -> None:
    with pytest.raises(ValueError):
        _entry_source(_req([KernelFile("kernel.cu", "// not python")]))
