"""ModalExecutionProvider — the production ExecutionProvider backed by Modal GPUs.

Mirrors the MockProvider surface so the orchestration layer is agnostic to which one
it holds. Importing this module requires `modal`; keep it out of GPU-free code paths.
"""

from __future__ import annotations

from .contracts import RunRequest, RunResult
from .provider import ExecutionProvider


class ModalExecutionProvider(ExecutionProvider):
    name = "modal"

    def run(self, request: RunRequest) -> RunResult:  # pragma: no cover - requires Modal
        from .modal_app import MODAL_GPU, app, run_target_remote

        fn = run_target_remote.with_options(gpu=MODAL_GPU[request.gpu])
        with app.run():
            result: RunResult = fn.remote(request)
        return result

    def cancel(self, target_id: str) -> None:  # pragma: no cover
        # TODO(infra): track Modal call ids per target and cancel via the function handle.
        return None
