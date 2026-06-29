import pytest

from execution.contracts import GpuType
from execution.cuda_runner import build_nvcc_command, parse_result_line, sm_arch


def test_sm_arch_known_gpus() -> None:
    assert sm_arch(GpuType.T4) == "75"
    assert sm_arch(GpuType.A100_80GB) == "80"
    assert sm_arch(GpuType.H100) == "90"
    assert sm_arch(GpuType.B200) == "100"


def test_build_nvcc_command_shape() -> None:
    cmd = build_nvcc_command(["kernel.cu", "kp_main.cu"], "kp_prog", GpuType.T4, ["-lcublas"])
    assert cmd[0] == "nvcc"
    assert "-arch=sm_75" in cmd
    assert cmd[cmd.index("-o") + 1] == "kp_prog"
    assert "kernel.cu" in cmd and "kp_main.cu" in cmd
    assert "-lcublas" in cmd


def test_parse_result_line_extracts_samples() -> None:
    stdout = (
        "some build noise\n"
        'KP_RESULT {"device":"Tesla T4","samples_ms":[1.5,1.6,1.55]}\n'
        "trailing\n"
    )
    assert parse_result_line(stdout) == [1.5, 1.6, 1.55]


def test_parse_result_line_missing_marker_raises() -> None:
    with pytest.raises(ValueError):
        parse_result_line("no marker here\n")
