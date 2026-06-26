import { z } from "zod";
import { GpuType } from "./gpu.js";

/** Languages supported at launch (CUDA + Triton). Mojo/ROCm reserved for later phases. */
export const KernelLanguage = z.enum(["cuda", "triton"]);
export type KernelLanguage = z.infer<typeof KernelLanguage>;

/** A single source file in a kernel project. */
export const KernelFile = z.object({
  path: z.string().min(1),
  content: z.string(),
});
export type KernelFile = z.infer<typeof KernelFile>;

/** Knobs for the benchmark harness (§4). Defaults chosen for trustworthy measurement. */
export const BenchmarkConfig = z.object({
  warmupIters: z.number().int().min(0).default(10),
  timedIters: z.number().int().min(1).default(50),
  /** Flush the L2 cache between timed iterations to avoid optimistic numbers. */
  flushL2: z.boolean().default(true),
  /** Hard ceiling per target; the sandbox kills runs that exceed it (§11). */
  timeoutSec: z.number().int().min(1).max(300).default(60),
});
export type BenchmarkConfig = z.infer<typeof BenchmarkConfig>;

/** What the API hands to an ExecutionProvider for a single (kernel, GPU) target. */
export const RunRequest = z.object({
  runId: z.string(),
  targetId: z.string(),
  /** Idempotency key — providers must not double-execute the same key (§8). */
  idempotencyKey: z.string(),
  language: KernelLanguage,
  gpu: GpuType,
  files: z.array(KernelFile).min(1),
  entryPoint: z.string().min(1),
  compilerFlags: z.array(z.string()).default([]),
  benchmark: BenchmarkConfig,
});
export type RunRequest = z.infer<typeof RunRequest>;

/** Aggregated timing statistics over the timed iterations (§4). */
export const BenchmarkStats = z.object({
  meanMs: z.number(),
  medianMs: z.number(),
  minMs: z.number(),
  p95Ms: z.number(),
  stddevMs: z.number(),
  iters: z.number().int(),
});
export type BenchmarkStats = z.infer<typeof BenchmarkStats>;

/** Per-target hardware metrics surfaced in the comparison view (§3). */
export const KernelMetrics = z.object({
  throughputGflops: z.number().nullable(),
  achievedBandwidthGbs: z.number().nullable(),
  occupancyPct: z.number().nullable(),
  registersPerThread: z.number().int().nullable(),
  sharedMemBytes: z.number().int().nullable(),
});
export type KernelMetrics = z.infer<typeof KernelMetrics>;

export const RunStatus = z.enum([
  "queued",
  "compiling",
  "running",
  "succeeded",
  "compile_error",
  "runtime_error",
  "timeout",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatus>;

/** Result for a single (kernel, GPU) target, returned by the provider to the API. */
export const RunResult = z.object({
  runId: z.string(),
  targetId: z.string(),
  gpu: GpuType,
  status: RunStatus,
  /** Actual GPU-seconds consumed; drives credit settlement and perf/$ (§3, §8). */
  gpuSeconds: z.number().nonnegative(),
  stats: BenchmarkStats.nullable(),
  metrics: KernelMetrics.nullable(),
  stdout: z.string().default(""),
  stderr: z.string().default(""),
  /** Populated on compile_error / runtime_error. */
  diagnostics: z.string().nullable().default(null),
});
export type RunResult = z.infer<typeof RunResult>;
