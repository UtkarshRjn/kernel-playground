import { GPU_CATALOG, type GpuType } from "@kp/shared";

/** USD value of one credit. 1 credit = 1 US cent. */
export const CREDIT_VALUE_USD = 0.01;

/**
 * Fixed overhead (seconds) added to every target's hold estimate to cover
 * compile + sandbox spin-up that isn't part of the timed kernel run.
 */
export const COMPILE_OVERHEAD_SEC = 8;

/**
 * Billable seconds added to every target's charge for time the provider bills but the
 * in-container timer can't see: scheduling, container cold start and image load.
 */
export const CONTAINER_STARTUP_OVERHEAD_SEC = 10;

/** Multiplier applied to provider cost when converting to credits (1.3 = 30% margin). */
export const PRICE_MULTIPLIER = 1.3;

/** Minimum credits charged for any target that ran on the provider. */
export const MIN_CREDITS_PER_TARGET = 1;

/**
 * Non-GPU per-second cost of a run container: Modal bills CPU ($0.0000131/core/s) and
 * memory ($0.00000222/GiB/s) on top of the GPU. Sized for ~1 physical core + 2 GiB
 * (nvcc / torch import), above Modal's 0.125-core / 128 MiB minimum request.
 */
export const CONTAINER_CPU_MEMORY_USD_PER_SEC = 0.0000131 * 1 + 0.00000222 * 2;

/** Knobs that turn provider cost into the credits a user is charged. */
export interface BillingConfig {
  startupOverheadSec: number;
  priceMultiplier: number;
  minCreditsPerTarget: number;
  cpuMemoryUsdPerSec: number;
}

export const DEFAULT_BILLING_CONFIG: BillingConfig = {
  startupOverheadSec: CONTAINER_STARTUP_OVERHEAD_SEC,
  priceMultiplier: PRICE_MULTIPLIER,
  minCreditsPerTarget: MIN_CREDITS_PER_TARGET,
  cpuMemoryUsdPerSec: CONTAINER_CPU_MEMORY_USD_PER_SEC,
};

/**
 * True cloud GPU cost in USD for a given GPU running for `gpuSeconds` — no overhead or
 * margin. Use this for `Run.costUsd` and perf/$; use `captureCredits` for charging.
 */
export function costUsd(gpu: GpuType, gpuSeconds: number): number {
  if (gpuSeconds < 0) throw new Error("gpuSeconds must be >= 0");
  return GPU_CATALOG[gpu].pricePerSec * gpuSeconds;
}

/** Convert USD to whole credits, always rounding up so we never undercharge. */
export function usdToCredits(usd: number): number {
  if (usd < 0) throw new Error("usd must be >= 0");
  return Math.ceil(usd / CREDIT_VALUE_USD);
}

/** USD the user is charged for a target: (GPU + CPU/mem) × (measured + startup) × markup. */
export function chargeUsd(
  gpu: GpuType,
  gpuSeconds: number,
  config: BillingConfig = DEFAULT_BILLING_CONFIG,
): number {
  if (gpuSeconds < 0) throw new Error("gpuSeconds must be >= 0");
  const billableSec = gpuSeconds + config.startupOverheadSec;
  const perSec = GPU_CATALOG[gpu].pricePerSec + config.cpuMemoryUsdPerSec;
  return perSec * billableSec * config.priceMultiplier;
}

/**
 * Credits to capture for a target from its measured GPU-seconds. Applies to every target
 * the provider returned a result for (including compile/runtime errors), since the
 * container was billed either way.
 */
export function captureCredits(
  gpu: GpuType,
  gpuSeconds: number,
  config: BillingConfig = DEFAULT_BILLING_CONFIG,
): number {
  return Math.max(config.minCreditsPerTarget, usdToCredits(chargeUsd(gpu, gpuSeconds, config)));
}

/**
 * Worst-case credit estimate for a target, used to size the pre-run hold (§8). It is the
 * capture for `timeoutSec + COMPILE_OVERHEAD_SEC` measured seconds, so (capture being
 * monotonic) the hold always covers the max possible capture; the rest is released.
 */
export function estimateHoldCredits(
  gpu: GpuType,
  timeoutSec: number,
  config: BillingConfig = DEFAULT_BILLING_CONFIG,
): number {
  return captureCredits(gpu, timeoutSec + COMPILE_OVERHEAD_SEC, config);
}

/** Performance-per-dollar score (higher is better) for the comparison view (§3). */
export function perfPerDollar(throughputGflops: number, gpu: GpuType, gpuSeconds: number): number {
  const usd = costUsd(gpu, gpuSeconds);
  if (usd === 0) return Number.POSITIVE_INFINITY;
  return throughputGflops / usd;
}
