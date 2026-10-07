import { z } from "zod";
import { GpuType } from "./gpu.js";

/** Languages supported at launch (CUDA + Triton). Mojo/ROCm reserved for later phases. */
export const KernelLanguage = z.enum(["cuda", "triton"]);
export type KernelLanguage = z.infer<typeof KernelLanguage>;

/**
 * Limits on untrusted submissions and their output. Mirrored in
 * services/execution/src/execution/limits.py; sizes are string lengths (characters).
 */
export const MAX_FILES = 16;
export const MAX_FILE_CHARS = 256 * 1024;
export const MAX_PATH_CHARS = 128;
export const MAX_WARMUP_ITERS = 1_000;
export const MAX_TIMED_ITERS = 10_000;
export const MAX_OUTPUT_CHARS = 64 * 1024;

/** Relative POSIX path; each segment starts with [A-Za-z0-9_] (no "..", ".", dotfiles, "/x"). */
const SAFE_PATH = /^[A-Za-z0-9_][A-Za-z0-9._-]*(\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/;

/** A single source file in a kernel project. */
export const KernelFile = z.object({
  path: z.string().min(1).max(MAX_PATH_CHARS).regex(SAFE_PATH, "invalid file path"),
  content: z.string().max(MAX_FILE_CHARS),
});
export type KernelFile = z.infer<typeof KernelFile>;

/** Cap untrusted output (stdout/stderr/diagnostics) at `limit` characters. */
export function truncateOutput(text: string, limit: number = MAX_OUTPUT_CHARS): string {
  if (text.length <= limit) return text;
  const marker = `\n...[truncated; ${text.length} chars total]`;
  return text.slice(0, Math.max(0, limit - marker.length)) + marker;
}

/** Knobs for the benchmark harness (§4). Defaults chosen for trustworthy measurement. */
export const BenchmarkConfig = z.object({
  warmupIters: z.number().int().min(0).max(MAX_WARMUP_ITERS).default(10),
  timedIters: z.number().int().min(1).max(MAX_TIMED_ITERS).default(50),
  /** Flush the L2 cache between timed iterations to avoid optimistic numbers. */
  flushL2: z.boolean().default(true),
  /**
   * Hard ceiling per target; the sandbox kills runs that exceed it (§11). Capped so cold
   * start + compile + run fits the web function's 300s maxDuration (Vercel Hobby).
   */
  timeoutSec: z.number().int().min(1).max(120).default(60),
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
  files: z.array(KernelFile).min(1).max(MAX_FILES),
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
