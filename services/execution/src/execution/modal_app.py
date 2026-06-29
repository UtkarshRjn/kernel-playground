"""Modal app skeleton for GPU execution (Phase 0 stub).

Import-guarded so this module imports cleanly without ``modal`` installed (CI/tests).
The real compile→run→benchmark body is filled in during Phase 1. This file pins down
the GPU mapping and the function shape so the rest of the system can be built against it.
"""

from __future__ import annotations

from typing import Any

from .contracts import GpuType

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

try:
    import modal

    _MODAL_AVAILABLE = True
except ImportError:  # pragma: no cover - modal absent in CI
    modal = None
    _MODAL_AVAILABLE = False


def is_available() -> bool:
    """Whether the Modal SDK is importable in this environment."""
    return _MODAL_AVAILABLE


def build_app() -> tuple[Any, Any]:  # pragma: no cover - exercised where modal is installed
    """Construct the Modal app + GPU image. Real run logic arrives in Phase 1."""
    if not _MODAL_AVAILABLE:
        raise RuntimeError("modal is not installed; install with extras: pip install '.[modal]'")

    app = modal.App("kernel-playground-execution")
    image = (
        modal.Image.debian_slim()
        .apt_install("build-essential")
        # CUDA toolkit + Triton land here in Phase 1.
    )
    return app, image
