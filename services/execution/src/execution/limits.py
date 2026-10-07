"""Size/shape limits for untrusted submissions and their output.

Mirrors the limits in packages/shared/src/run.ts. Sizes are in characters (Python
``len``), which never exceeds the TS UTF-16 length, so anything the API accepts also
passes here.
"""

from __future__ import annotations

import re
from pathlib import Path

MAX_FILES = 16
MAX_FILE_CHARS = 256 * 1024
MAX_PATH_CHARS = 128
MAX_WARMUP_ITERS = 1_000
MAX_TIMED_ITERS = 10_000
MAX_OUTPUT_CHARS = 64 * 1024

# Relative POSIX path of simple segments. Each segment must start with [A-Za-z0-9_], which
# rules out "", ".", ".." and dotfiles; "/" is the only separator (no "\\", no leading "/").
_PATH_RE = re.compile(r"[A-Za-z0-9_][A-Za-z0-9._-]*(/[A-Za-z0-9_][A-Za-z0-9._-]*)*")


def validate_path(path: str) -> None:
    """Raise ValueError unless ``path`` is a safe relative path inside the workdir."""
    if len(path) > MAX_PATH_CHARS:
        raise ValueError(f"file path exceeds {MAX_PATH_CHARS} characters")
    if not _PATH_RE.fullmatch(path):
        raise ValueError(f"invalid file path: {path!r}")


def safe_join(workdir: Path, path: str) -> Path:
    """Resolve ``path`` under ``workdir``, refusing anything that escapes it."""
    validate_path(path)
    root = workdir.resolve()
    target = (root / path).resolve()
    if not target.is_relative_to(root):
        raise ValueError(f"file path escapes workdir: {path!r}")
    return target


def truncate_output(text: str, limit: int = MAX_OUTPUT_CHARS) -> str:
    """Cap ``text`` at ``limit`` characters, marking how much was dropped."""
    if len(text) <= limit:
        return text
    marker = f"\n...[truncated; {len(text)} chars total]"
    return text[: max(0, limit - len(marker))] + marker
