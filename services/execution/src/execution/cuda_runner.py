"""Compile + run + benchmark a CUDA submission (§2/§4).

Splits cleanly into pure helpers (arch mapping, nvcc command, output parsing) that are
unit-tested without a GPU, and ``run_cuda`` which does the actual compile/exec on a GPU
host (invoked inside the Modal worker). The timing rigor lives in harness/kp_main.cu.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path

from .benchmark import summarize
from .contracts import GpuType, RunRequest, RunResult, RunStatus

# CUDA compute capability (SM arch) per GPU. Used for nvcc -arch=sm_XX.
SM_ARCH: dict[GpuType, str] = {
    GpuType.T4: "75",
    GpuType.L4: "89",
    GpuType.A10: "86",
    GpuType.A100_40GB: "80",
    GpuType.A100_80GB: "80",
    GpuType.H100: "90",
    GpuType.H200: "90",
    GpuType.B200: "100",
}

RESULT_MARKER = "KP_RESULT "


def harness_main_path() -> Path:
    """Location of the injected benchmark driver.

    Overridable via KP_HARNESS_MAIN so it resolves both locally (package data) and
    when baked into the Modal image at a fixed path.
    """
    override = os.environ.get("KP_HARNESS_MAIN")
    if override:
        return Path(override)
    return Path(__file__).parent / "harness" / "kp_main.cu"


def sm_arch(gpu: GpuType) -> str:
    arch = SM_ARCH.get(gpu)
    if arch is None:
        raise ValueError(f"no SM arch mapping for {gpu}")
    return arch


def build_nvcc_command(
    sources: list[str], output: str, gpu: GpuType, extra_flags: list[str]
) -> list[str]:
    """Assemble the nvcc invocation. Pure — no filesystem access."""
    return [
        "nvcc",
        "-O3",
        f"-arch=sm_{sm_arch(gpu)}",
        "-o",
        output,
        *sources,
        *extra_flags,
    ]


def parse_result_line(stdout: str) -> list[float]:
    """Extract per-iteration sample timings from the harness's KP_RESULT line."""
    for line in stdout.splitlines():
        if line.startswith(RESULT_MARKER):
            payload = json.loads(line[len(RESULT_MARKER) :])
            samples = payload.get("samples_ms", [])
            return [float(s) for s in samples]
    raise ValueError("no KP_RESULT line found in program output")


def _materialize(request: RunRequest, workdir: Path) -> list[str]:
    """Write user .cu sources + the injected benchmark driver; return source filenames."""
    src_names: list[str] = []
    for f in request.files:
        path = workdir / f.path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f.content)
        if f.path.endswith(".cu"):
            src_names.append(f.path)
    (workdir / "kp_main.cu").write_text(harness_main_path().read_text())
    src_names.append("kp_main.cu")
    return src_names


def compile_only(request: RunRequest, workdir: Path) -> RunResult:
    """Compile a CUDA submission WITHOUT running it — a GPU-free syntax/compile check.

    nvcc targets a compute arch and emits a binary without needing a physical GPU, so this
    runs on a cheap CPU container. Catches compile errors only; never executes the kernel.
    """
    started = time.monotonic()
    src_names = _materialize(request, workdir)
    cmd = build_nvcc_command(src_names, "kp_prog", request.gpu, request.compiler_flags)
    proc = subprocess.run(cmd, cwd=workdir, capture_output=True, text=True, timeout=120)
    elapsed = time.monotonic() - started
    if proc.returncode != 0:
        return RunResult(
            run_id=request.run_id,
            target_id=request.target_id,
            gpu=request.gpu,
            status=RunStatus.COMPILE_ERROR,
            gpu_seconds=elapsed,
            stderr=proc.stderr,
            diagnostics=proc.stderr,
        )
    return RunResult(
        run_id=request.run_id,
        target_id=request.target_id,
        gpu=request.gpu,
        status=RunStatus.SUCCEEDED,
        gpu_seconds=elapsed,
        stdout="Compiled successfully.",
    )


def run_cuda(request: RunRequest, workdir: Path) -> RunResult:
    """Compile and benchmark a CUDA submission inside ``workdir`` on a GPU host."""
    started = time.monotonic()

    def result(status: RunStatus, **kw: object) -> RunResult:
        return RunResult(
            run_id=request.run_id,
            target_id=request.target_id,
            gpu=request.gpu,
            status=status,
            gpu_seconds=time.monotonic() - started,
            **kw,  # type: ignore[arg-type]
        )

    src_names = _materialize(request, workdir)
    binary = "kp_prog"
    compile_cmd = build_nvcc_command(src_names, binary, request.gpu, request.compiler_flags)
    compile_proc = subprocess.run(
        compile_cmd, cwd=workdir, capture_output=True, text=True, timeout=120
    )
    if compile_proc.returncode != 0:
        return result(
            RunStatus.COMPILE_ERROR,
            stderr=compile_proc.stderr,
            diagnostics=compile_proc.stderr,
        )

    env = {
        "KP_WARMUP": str(request.benchmark.warmup_iters),
        "KP_ITERS": str(request.benchmark.timed_iters),
        "KP_FLUSH_L2": "1" if request.benchmark.flush_l2 else "0",
    }
    try:
        run_proc = subprocess.run(
            [f"./{binary}"],
            cwd=workdir,
            capture_output=True,
            text=True,
            timeout=request.benchmark.timeout_sec,
            env=env,
        )
    except subprocess.TimeoutExpired:
        return result(RunStatus.TIMEOUT, diagnostics="execution exceeded timeout")

    if run_proc.returncode != 0:
        return result(
            RunStatus.RUNTIME_ERROR, stdout=run_proc.stdout, stderr=run_proc.stderr,
            diagnostics=run_proc.stderr,
        )

    try:
        samples = parse_result_line(run_proc.stdout)
        stats = summarize(samples)
    except (ValueError, json.JSONDecodeError) as e:
        return result(RunStatus.RUNTIME_ERROR, stdout=run_proc.stdout, diagnostics=str(e))

    return result(RunStatus.SUCCEEDED, stats=stats, stdout=run_proc.stdout)
