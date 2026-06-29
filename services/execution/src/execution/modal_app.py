"""Modal app: compile + benchmark CUDA kernels on real GPUs (§2/§4/§11).

Run a verification end to end:

    modal run -m execution.modal_app

The GPU function is import-guarded so the module imports cleanly without `modal`
installed (CI/tests import contracts/cuda_runner, never this app).
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from .contracts import (
    BenchmarkConfig,
    GpuType,
    KernelFile,
    KernelLanguage,
    RunRequest,
    RunResult,
)

# Map our canonical GpuType to Modal's GPU request strings.
MODAL_GPU: dict[GpuType, str] = {
    GpuType.T4: "T4",
    GpuType.L4: "L4",
    GpuType.A10: "A10G",
    GpuType.A100_40GB: "A100-40GB",
    GpuType.A100_80GB: "A100-80GB",
    GpuType.H100: "H100",
    GpuType.H200: "H200",
    GpuType.B200: "B200",
}

HARNESS_REMOTE = "/opt/kp/kp_main.cu"
_HARNESS_LOCAL = Path(__file__).parent / "harness" / "kp_main.cu"

try:
    import modal

    _MODAL_AVAILABLE = True
except ImportError:  # pragma: no cover - modal absent in CI
    modal = None  # type: ignore[assignment]
    _MODAL_AVAILABLE = False


def is_available() -> bool:
    return _MODAL_AVAILABLE


if _MODAL_AVAILABLE:
    app = modal.App("kernel-playground-execution")

    # CUDA toolkit (nvcc) image; our package source + the injected harness are baked in.
    image = (
        modal.Image.from_registry(
            "nvidia/cuda:12.4.1-devel-ubuntu22.04", add_python="3.11"
        )
        .env({"KP_HARNESS_MAIN": HARNESS_REMOTE})
        .add_local_file(str(_HARNESS_LOCAL), HARNESS_REMOTE)
        .add_local_python_source("execution")
    )

    @app.function(image=image, gpu="T4", timeout=600)
    def run_target_remote(request: RunRequest) -> RunResult:  # pragma: no cover - on GPU
        from .cuda_runner import run_cuda

        with tempfile.TemporaryDirectory() as d:
            return run_cuda(request, Path(d))

    # Triton runs Python kernels; this image bundles torch + triton (no nvcc needed).
    triton_image = (
        modal.Image.debian_slim(python_version="3.11")
        .pip_install("torch", "triton")
        .add_local_python_source("execution")
    )

    @app.function(image=triton_image, gpu="T4", timeout=600)
    def run_triton_remote(request: RunRequest) -> RunResult:  # pragma: no cover - on GPU
        from .triton_runner import run_triton

        with tempfile.TemporaryDirectory() as d:
            return run_triton(request, Path(d))

    # CPU image for the HTTP endpoint; it only dispatches to the GPU function above.
    api_image = (
        modal.Image.debian_slim(python_version="3.11")
        .pip_install("fastapi[standard]")
        .add_local_python_source("execution")
    )

    @app.function(image=api_image, secrets=[modal.Secret.from_name("kp-exec-secret")])
    @modal.asgi_app()
    def web() -> Any:  # pragma: no cover - served by Modal
        import os

        from fastapi import FastAPI, Header, HTTPException

        from .wire import request_from_json, result_to_json

        api = FastAPI(title="Kernel Playground execution")

        @api.post("/bench")
        def bench(
            payload: dict[str, Any], authorization: str | None = Header(default=None)
        ) -> Any:
            token = os.environ.get("KP_EXEC_TOKEN", "")
            if not token or authorization != f"Bearer {token}":
                raise HTTPException(status_code=401, detail="unauthorized")
            request = request_from_json(payload)
            runner = (
                run_triton_remote
                if request.language is KernelLanguage.TRITON
                else run_target_remote
            )
            fn = runner.with_options(gpu=MODAL_GPU[request.gpu])
            return result_to_json(fn.remote(request))

        return api

    @app.local_entrypoint()
    def main(gpu: str = "T4") -> None:  # pragma: no cover - manual verification
        """Compile + benchmark the bundled vector-add example on the given GPU."""
        kernel = (Path(__file__).parent / "examples" / "vector_add.cu").read_text()
        request = RunRequest(
            run_id="verify",
            target_id=f"verify:{gpu}",
            idempotency_key=f"verify:{gpu}",
            language=KernelLanguage.CUDA,
            gpu=GpuType(gpu),
            files=[KernelFile(path="vector_add.cu", content=kernel)],
            entry_point="kp_run",
            benchmark=BenchmarkConfig(warmup_iters=10, timed_iters=50),
        )
        fn = run_target_remote.with_options(gpu=MODAL_GPU[GpuType(gpu)])
        result: RunResult = fn.remote(request)
        print(f"status={result.status} gpu={result.gpu} gpu_seconds={result.gpu_seconds:.2f}")
        if result.stats:
            s = result.stats
            print(
                f"median={s.median_ms:.4f}ms p95={s.p95_ms:.4f}ms "
                f"min={s.min_ms:.4f}ms stddev={s.stddev_ms:.4f}ms over {s.iters} iters"
            )
        if result.diagnostics:
            print("diagnostics:\n", result.diagnostics)


def build_image() -> Any:  # pragma: no cover - convenience for external callers
    if not _MODAL_AVAILABLE:
        raise RuntimeError("modal is not installed; pip install '.[modal]'")
    return image
