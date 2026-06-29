"""GPU-free compile/syntax check, dispatched by language.

This is the cheap "Test" path — it validates that a submission compiles (CUDA) or parses
(Triton) on a CPU container, with no GPU involved, so users can iterate freely before
spending GPU time on a Submit.
"""

from __future__ import annotations

from pathlib import Path

from .contracts import KernelLanguage, RunRequest, RunResult
from .cuda_runner import compile_only
from .triton_runner import syntax_check


def compile_check(request: RunRequest, workdir: Path) -> RunResult:
    if request.language is KernelLanguage.TRITON:
        return syntax_check(request)
    return compile_only(request, workdir)
