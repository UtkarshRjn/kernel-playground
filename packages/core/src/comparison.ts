import { GPU_CATALOG, type GpuType, type RunResult } from "@kp/shared";
import { costUsd } from "./cost.js";

/** One row of the cross-GPU comparison view (§3). */
export interface ComparisonRow {
  gpu: GpuType;
  status: string;
  /** Median kernel time in ms; null if the target didn't produce stats. */
  medianMs: number | null;
  /** Actual cloud cost (USD) billed for this target's GPU time. */
  costUsd: number;
  /** How many times faster than the slowest successful target (>= 1), or null. */
  speedupVsSlowest: number | null;
  /**
   * Hardware value: kernel throughput per dollar-per-second of the GPU
   * = (1 / medianMs) / pricePerSec. Higher = faster and/or cheaper. Null if no stats.
   */
  speedPerDollar: number | null;
}

export interface Comparison {
  rows: ComparisonRow[];
  /** GPU with the lowest median runtime. */
  fastestGpu: GpuType | null;
  /** GPU with the best speed-per-dollar — the "which should I buy/rent" answer. */
  bestValueGpu: GpuType | null;
}

/**
 * Turn raw per-GPU results into a ranked comparison. Only successful targets with
 * timing stats participate in the fastest / best-value rankings; failed targets still
 * appear as rows so the user sees what broke.
 */
export function buildComparison(targets: RunResult[]): Comparison {
  const successful = targets.filter((t) => t.stats !== null);
  const slowestMedian = successful.reduce(
    (max, t) => Math.max(max, t.stats!.medianMs),
    0,
  );

  const rows: ComparisonRow[] = targets.map((t) => {
    const medianMs = t.stats?.medianMs ?? null;
    const speedPerDollar =
      medianMs !== null ? 1 / medianMs / GPU_CATALOG[t.gpu].pricePerSec : null;
    return {
      gpu: t.gpu,
      status: t.status,
      medianMs,
      costUsd: costUsd(t.gpu, t.gpuSeconds),
      speedupVsSlowest:
        medianMs !== null && slowestMedian > 0 ? slowestMedian / medianMs : null,
      speedPerDollar,
    };
  });

  let fastestGpu: GpuType | null = null;
  let bestValueGpu: GpuType | null = null;
  let bestMedian = Infinity;
  let bestValue = -Infinity;
  for (const r of rows) {
    if (r.medianMs !== null && r.medianMs < bestMedian) {
      bestMedian = r.medianMs;
      fastestGpu = r.gpu;
    }
    if (r.speedPerDollar !== null && r.speedPerDollar > bestValue) {
      bestValue = r.speedPerDollar;
      bestValueGpu = r.gpu;
    }
  }

  return { rows, fastestGpu, bestValueGpu };
}
