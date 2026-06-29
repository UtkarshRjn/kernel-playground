import type { RunRequest, RunResult } from "./run.js";

/**
 * The seam between the product (web/API) and the GPU execution backend.
 *
 * Phase 0/1 ships a Modal-backed provider. Because everything goes through this
 * interface, a RunPod warm-pool provider can be added later purely as a cost
 * optimization without touching the API (see docs/BUILD_PLAN.md §4).
 */
export interface ExecutionProvider {
  /** Stable identifier for logs/metrics, e.g. "modal", "runpod", "mock". */
  readonly name: string;

  /**
   * Execute one (kernel, GPU) target and resolve with its result.
   * Implementations MUST honor request.idempotencyKey and never double-execute it.
   * Failures are reported in RunResult.status, not thrown, except for
   * infrastructure errors the API should retry.
   */
  run(request: RunRequest): Promise<RunResult>;

  /**
   * GPU-free compile/syntax check (the cheap "Test" path). Returns a RunResult with
   * status `succeeded` or `compile_error` — never runs the kernel on a GPU.
   */
  compileCheck(request: RunRequest): Promise<RunResult>;

  /** Best-effort cancellation of an in-flight target (§11 kill-on-overrun). */
  cancel(targetId: string): Promise<void>;
}
