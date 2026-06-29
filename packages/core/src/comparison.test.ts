import { describe, expect, it } from "vitest";
import type { GpuType, RunResult } from "@kp/shared";
import { buildComparison } from "./comparison.js";

function target(gpu: GpuType, medianMs: number | null, gpuSeconds = 4): RunResult {
  return {
    runId: "r",
    targetId: `r:${gpu}`,
    gpu,
    status: medianMs === null ? "runtime_error" : "succeeded",
    gpuSeconds,
    stats:
      medianMs === null
        ? null
        : { meanMs: medianMs, medianMs, minMs: medianMs, p95Ms: medianMs, stddevMs: 0, iters: 50 },
    metrics: null,
    stdout: "",
    stderr: "",
    diagnostics: null,
  };
}

describe("buildComparison", () => {
  it("picks the lowest-median GPU as fastest", () => {
    const c = buildComparison([target("T4", 2.0), target("H100", 0.5), target("A100_80GB", 1.0)]);
    expect(c.fastestGpu).toBe("H100");
  });

  it("computes speedup relative to the slowest target", () => {
    const c = buildComparison([target("T4", 2.0), target("H100", 0.5)]);
    const h100 = c.rows.find((r) => r.gpu === "H100")!;
    expect(h100.speedupVsSlowest).toBeCloseTo(4); // 2.0 / 0.5
  });

  it("best value can differ from fastest (cheap GPU wins on perf/$)", () => {
    // T4 is much cheaper; if it's only ~3x slower than H100 it should win value.
    const c = buildComparison([target("T4", 1.5), target("H100", 0.5)]);
    expect(c.fastestGpu).toBe("H100");
    expect(c.bestValueGpu).toBe("T4");
  });

  it("keeps failed targets as rows but excludes them from rankings", () => {
    const c = buildComparison([target("T4", 1.0), target("B200", null)]);
    expect(c.rows).toHaveLength(2);
    expect(c.fastestGpu).toBe("T4");
    const b200 = c.rows.find((r) => r.gpu === "B200")!;
    expect(b200.medianMs).toBeNull();
    expect(b200.speedPerDollar).toBeNull();
  });
});
