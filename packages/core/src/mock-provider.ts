import type { ExecutionProvider, GpuType, RunRequest, RunResult } from "@kp/shared";
import { offlineSyntaxCheck } from "./syntax-check.js";

/** Relative speed factors (smaller = faster). Dev-only, mirrors the Python MockProvider. */
const SPEED: Record<GpuType, number> = {
  T4: 4.0,
  L4: 2.6,
  A10: 2.2,
  A100_40GB: 1.4,
  A100_80GB: 1.3,
  H100: 1.0,
  H200: 0.9,
  B200: 0.6,
};

/**
 * Deterministic, GPU-free provider for local dev and tests. Produces stable, plausible
 * timings so the full run lifecycle (hold → run → settle) can be exercised offline.
 */
export class MockExecutionProvider implements ExecutionProvider {
  readonly name = "mock";

  async run(request: RunRequest): Promise<RunResult> {
    const base = SPEED[request.gpu];
    const { timedIters } = request.benchmark;
    const samples: number[] = [];
    for (let i = 0; i < timedIters; i++) {
      samples.push(base * (1 + 0.01 * (i % 5)));
    }
    const meanMs = samples.reduce((a, b) => a + b, 0) / samples.length;
    const sorted = [...samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? meanMs;
    const gpuSeconds = (meanMs / 1000) * timedIters;

    return {
      runId: request.runId,
      targetId: request.targetId,
      gpu: request.gpu,
      status: "succeeded",
      gpuSeconds,
      stats: {
        meanMs,
        medianMs: median,
        minMs: sorted[0] ?? meanMs,
        p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? meanMs,
        stddevMs: 0,
        iters: timedIters,
      },
      metrics: null,
      stdout: `[mock] ran ${request.entryPoint} on ${request.gpu}\n`,
      stderr: "",
      diagnostics: null,
    };
  }

  async compileCheck(request: RunRequest): Promise<RunResult> {
    // Offline heuristic check (no real compiler available). The Modal nvcc/python
    // backend is the source of truth; this catches obvious mistakes so the mock
    // doesn't blindly pass broken code.
    const code = request.files.map((f) => f.content).join("\n");
    const issue = offlineSyntaxCheck(code, request.language);
    if (issue) {
      return {
        runId: request.runId,
        targetId: request.targetId,
        gpu: request.gpu,
        status: "compile_error",
        gpuSeconds: 0,
        stats: null,
        metrics: null,
        stdout: "",
        stderr: issue,
        diagnostics: `Offline syntax check: ${issue}`,
      };
    }
    return {
      runId: request.runId,
      targetId: request.targetId,
      gpu: request.gpu,
      status: "succeeded",
      gpuSeconds: 0,
      stats: null,
      metrics: null,
      stdout: "Passed offline syntax check (mock — not a full compile).",
      stderr: "",
      diagnostics: null,
    };
  }

  async cancel(): Promise<void> {
    return;
  }
}
