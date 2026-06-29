import { describe, expect, it } from "vitest";
import { offlineSyntaxCheck } from "./syntax-check.js";

const VALID_CUDA = `#include <cuda_runtime.h>
extern "C" void kp_setup() { cudaMalloc(&dA, 4); }
extern "C" void kp_run() { vadd<<<1, 256>>>(dA, dB, dC, 4); }
`;

describe("offlineSyntaxCheck", () => {
  it("passes a valid CUDA kernel", () => {
    expect(offlineSyntaxCheck(VALID_CUDA, "cuda")).toBeNull();
  });

  it("catches the unbalanced-paren bug (the reported case)", () => {
    const broken = `extern "C" void kp_setup() {
  cudaMalloc(&d
}
extern "C" void kp_run() { vadd<<<1,1>>>(dA); }`;
    expect(offlineSyntaxCheck(broken, "cuda")).toMatch(/unclosed|unexpected/);
  });

  it("catches a missing closing brace", () => {
    expect(offlineSyntaxCheck('void kp_run() { if (x) {', "cuda")).toMatch(/unclosed/);
  });

  it("flags a missing kp_run", () => {
    expect(offlineSyntaxCheck("int x = 1;", "cuda")).toMatch(/kp_run/);
  });

  it("ignores brackets inside comments and strings", () => {
    const ok = `// a stray ) bracket in a comment
extern "C" void kp_run() { const char* s = "}}}"; }`;
    expect(offlineSyntaxCheck(ok, "cuda")).toBeNull();
  });

  it("handles Triton (# comments) and finds kp_run", () => {
    const tri = `# a comment with ) bracket
def kp_run():
    add_kernel[(1,)](x)
`;
    expect(offlineSyntaxCheck(tri, "triton")).toBeNull();
  });
});
