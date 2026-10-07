import { describe, expect, it } from "vitest";
import {
  BenchmarkConfig,
  KernelFile,
  MAX_FILE_CHARS,
  MAX_FILES,
  MAX_OUTPUT_CHARS,
  MAX_PATH_CHARS,
  MAX_TIMED_ITERS,
  MAX_WARMUP_ITERS,
  RunRequest,
  truncateOutput,
} from "@kp/shared";

// Schema limits live in @kp/shared (no test runner there); exercised here.
const request = (files: unknown[]) => ({
  runId: "r",
  targetId: "r:T4",
  idempotencyKey: "r:T4",
  language: "cuda",
  gpu: "T4",
  files,
  entryPoint: "kp_run",
  benchmark: {},
});

describe("KernelFile", () => {
  it.each(["kernel.cu", "kernel.py", "src/util.cuh", "a/b/c_d-e.1.h", "_private.py"])(
    "accepts %s",
    (path) => {
      expect(KernelFile.safeParse({ path, content: "" }).success).toBe(true);
    },
  );

  it.each([
    "",
    "/etc/passwd",
    "../escape.cu",
    "a/../../escape.cu",
    "a/./b.cu",
    "..",
    ".bashrc",
    "a//b.cu",
    "a/",
    "a\\b.cu",
    "nul\u0000.cu",
    "space name.cu",
    "x".repeat(MAX_PATH_CHARS + 1),
  ])("rejects %j", (path) => {
    expect(KernelFile.safeParse({ path, content: "" }).success).toBe(false);
  });

  it("caps content size", () => {
    const ok = { path: "kernel.cu", content: "x".repeat(MAX_FILE_CHARS) };
    expect(KernelFile.safeParse(ok).success).toBe(true);
    expect(KernelFile.safeParse({ ...ok, content: ok.content + "x" }).success).toBe(false);
  });
});

describe("RunRequest", () => {
  it("caps the number of files", () => {
    const files = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ path: `f${i}.cu`, content: "" }));
    expect(RunRequest.safeParse(request(files(MAX_FILES))).success).toBe(true);
    expect(RunRequest.safeParse(request(files(MAX_FILES + 1))).success).toBe(false);
  });
});

describe("BenchmarkConfig", () => {
  it("caps iteration counts", () => {
    const max = { warmupIters: MAX_WARMUP_ITERS, timedIters: MAX_TIMED_ITERS };
    expect(BenchmarkConfig.safeParse(max).success).toBe(true);
    expect(BenchmarkConfig.safeParse({ warmupIters: MAX_WARMUP_ITERS + 1 }).success).toBe(false);
    expect(BenchmarkConfig.safeParse({ timedIters: MAX_TIMED_ITERS + 1 }).success).toBe(false);
  });
});

describe("truncateOutput", () => {
  it("leaves short text alone", () => {
    expect(truncateOutput("hello", 10)).toBe("hello");
  });

  it("caps long text and marks it", () => {
    const out = truncateOutput("x".repeat(1000), 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out).toContain("truncated; 1000 chars total");
  });

  it("defaults to MAX_OUTPUT_CHARS", () => {
    expect(truncateOutput("y".repeat(MAX_OUTPUT_CHARS * 2)).length).toBeLessThanOrEqual(
      MAX_OUTPUT_CHARS,
    );
  });
});
