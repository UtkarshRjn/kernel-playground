"""Example Triton submission for the Kernel Playground benchmark harness.

Contract: define kp_run() (one iteration). Optionally define kp_setup() for one-time
allocation; it populates module globals that kp_run reads (mirrors the CUDA contract).
"""

import torch
import triton
import triton.language as tl

N = 1 << 22  # ~4M elements
_x: torch.Tensor
_y: torch.Tensor
_out: torch.Tensor


@triton.jit
def _add_kernel(x_ptr, y_ptr, out_ptr, n, BLOCK: tl.constexpr):
    pid = tl.program_id(axis=0)
    offsets = pid * BLOCK + tl.arange(0, BLOCK)
    mask = offsets < n
    x = tl.load(x_ptr + offsets, mask=mask)
    y = tl.load(y_ptr + offsets, mask=mask)
    tl.store(out_ptr + offsets, x + y, mask=mask)


def kp_setup() -> None:
    global _x, _y, _out
    _x = torch.randn(N, device="cuda")
    _y = torch.randn(N, device="cuda")
    _out = torch.empty(N, device="cuda")


def kp_run() -> None:
    grid = (triton.cdiv(N, 1024),)
    _add_kernel[grid](_x, _y, _out, N, BLOCK=1024)
