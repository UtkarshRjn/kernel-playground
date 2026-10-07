import type { GpuSpec } from "./gpu.js";
import { GpuType } from "./gpu.js";

/**
 * Static GPU catalog: hardware specs + cloud cost (USD / GPU-second).
 *
 * `pricePerSec` is Modal's list GPU price (https://modal.com/pricing, fetched
 * 2026-10-07; base region, preemptible). It is the true provider cost used for
 * `Run.costUsd` and perf/$ comparison (§3); credit charges add overhead + margin on
 * top (see `@kp/core` cost.ts). `tier` gates free vs paid access.
 */
export const GPU_CATALOG: Record<GpuType, GpuSpec> = {
  T4: {
    type: "T4",
    label: "NVIDIA Tesla T4",
    arch: "Turing",
    memoryGb: 16,
    memoryBandwidthGbs: 320,
    fp16Tflops: 65,
    pricePerSec: 0.000164,
    tier: "free",
  },
  L4: {
    type: "L4",
    label: "NVIDIA L4",
    arch: "Ada Lovelace",
    memoryGb: 24,
    memoryBandwidthGbs: 300,
    fp16Tflops: 121,
    pricePerSec: 0.000222,
    tier: "free",
  },
  A10: {
    type: "A10",
    label: "NVIDIA A10",
    arch: "Ampere",
    memoryGb: 24,
    memoryBandwidthGbs: 600,
    fp16Tflops: 125,
    pricePerSec: 0.000306,
    tier: "standard",
  },
  A100_40GB: {
    type: "A100_40GB",
    label: "NVIDIA A100 40GB",
    arch: "Ampere",
    memoryGb: 40,
    memoryBandwidthGbs: 1555,
    fp16Tflops: 312,
    pricePerSec: 0.000583,
    tier: "standard",
  },
  A100_80GB: {
    type: "A100_80GB",
    label: "NVIDIA A100 80GB",
    arch: "Ampere",
    memoryGb: 80,
    memoryBandwidthGbs: 2039,
    fp16Tflops: 312,
    pricePerSec: 0.000694,
    tier: "standard",
  },
  H100: {
    type: "H100",
    label: "NVIDIA H100",
    arch: "Hopper",
    memoryGb: 80,
    memoryBandwidthGbs: 3350,
    fp16Tflops: 990,
    pricePerSec: 0.001097,
    tier: "premium",
  },
  H200: {
    type: "H200",
    label: "NVIDIA H200",
    arch: "Hopper",
    memoryGb: 141,
    memoryBandwidthGbs: 4800,
    fp16Tflops: 990,
    pricePerSec: 0.001261,
    tier: "premium",
  },
  B200: {
    type: "B200",
    label: "NVIDIA B200",
    arch: "Blackwell",
    memoryGb: 192,
    memoryBandwidthGbs: 8000,
    fp16Tflops: 2250,
    pricePerSec: 0.001736,
    tier: "premium",
  },
};

/** Convenience: all catalog entries as an array. */
export const GPU_LIST: GpuSpec[] = GpuType.options.map((t) => GPU_CATALOG[t]);
