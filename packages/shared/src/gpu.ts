import { z } from "zod";

/**
 * Canonical GPU identifiers the platform can schedule work on.
 * Kept in sync with the Python execution backend (see services/execution).
 * Launch scope (Phase 0/1) targets NVIDIA only; ROCm is reserved for later.
 */
export const GpuType = z.enum([
  "T4",
  "L4",
  "A10",
  "A100_40GB",
  "A100_80GB",
  "H100",
  "H200",
  "B200",
]);
export type GpuType = z.infer<typeof GpuType>;

/** Static hardware spec + cost metadata used for perf/$ comparisons (§3, §9). */
export const GpuSpec = z.object({
  type: GpuType,
  label: z.string(),
  arch: z.string(),
  memoryGb: z.number().positive(),
  memoryBandwidthGbs: z.number().positive(),
  fp16Tflops: z.number().positive(),
  /** Cloud cost in USD per GPU-second; source of truth for perf/$ and credit settlement. */
  pricePerSec: z.number().nonnegative(),
  /** Tier gates free vs paid access (§8). */
  tier: z.enum(["free", "standard", "premium"]),
});
export type GpuSpec = z.infer<typeof GpuSpec>;
