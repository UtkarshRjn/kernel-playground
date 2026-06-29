import { GPU_CATALOG, type GpuType } from "@kp/shared";

/** USD value of one credit. 1 credit = 1 US cent. */
export const CREDIT_VALUE_USD = 0.01;

/**
 * Fixed overhead (seconds) added to every target's hold estimate to cover
 * compile + sandbox spin-up that isn't part of the timed kernel run.
 */
export const COMPILE_OVERHEAD_SEC = 8;

/** Cloud cost in USD for a given GPU running for `gpuSeconds`. */
export function costUsd(gpu: GpuType, gpuSeconds: number): number {
  if (gpuSeconds < 0) throw new Error("gpuSeconds must be >= 0");
  return GPU_CATALOG[gpu].pricePerSec * gpuSeconds;
}

/** Convert USD to whole credits, always rounding up so we never undercharge. */
export function usdToCredits(usd: number): number {
  if (usd < 0) throw new Error("usd must be >= 0");
  return Math.ceil(usd / CREDIT_VALUE_USD);
}

/**
 * Worst-case credit estimate for a target, used to size the pre-run hold (§8).
 * Bounds GPU time by the configured timeout plus compile overhead so the hold
 * always covers actual usage; the remainder is released at settlement.
 */
export function estimateHoldCredits(gpu: GpuType, timeoutSec: number): number {
  return usdToCredits(costUsd(gpu, timeoutSec + COMPILE_OVERHEAD_SEC));
}

/** Actual credits to capture for a target from its measured GPU-seconds. */
export function captureCredits(gpu: GpuType, gpuSeconds: number): number {
  return usdToCredits(costUsd(gpu, gpuSeconds));
}

/** Performance-per-dollar score (higher is better) for the comparison view (§3). */
export function perfPerDollar(throughputGflops: number, gpu: GpuType, gpuSeconds: number): number {
  const usd = costUsd(gpu, gpuSeconds);
  if (usd === 0) return Number.POSITIVE_INFINITY;
  return throughputGflops / usd;
}
