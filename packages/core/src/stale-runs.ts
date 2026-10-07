/**
 * Staleness rules for runs whose background worker died (e.g. the serverless function
 * hit its max duration) before settling. The sweeper marks such runs terminal and
 * releases their credit hold.
 */

/** Run statuses that mean "a worker should still be on it". */
export const NON_TERMINAL_RUN_STATUSES = ["queued", "running"] as const;

/** Target statuses that the sweeper overwrites with `timeout`. */
export const NON_TERMINAL_TARGET_STATUSES = ["queued", "compiling", "running"] as const;

/**
 * Lower bound for the threshold. Must exceed the longest a run can legitimately take,
 * which is capped by the tRPC route's `maxDuration` (300s) since processRun runs in
 * that same invocation via `after()`.
 */
export const MIN_STALE_RUN_THRESHOLD_SEC = 360;

export const DEFAULT_STALE_RUN_THRESHOLD_SEC = 600;

/**
 * Parse the configured threshold (seconds) into milliseconds. Missing/invalid values
 * fall back to the default; values below the minimum are clamped up to it.
 */
export function resolveStaleRunThresholdMs(raw: string | undefined): number {
  const parsed = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  const sec = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STALE_RUN_THRESHOLD_SEC;
  return Math.max(sec, MIN_STALE_RUN_THRESHOLD_SEC) * 1000;
}

/** Runs created strictly before this instant are stale (if still non-terminal). */
export function staleRunCutoff(now: Date, thresholdMs: number): Date {
  return new Date(now.getTime() - thresholdMs);
}

export function isRunStale(
  run: { status: string; createdAt: Date },
  now: Date,
  thresholdMs: number,
): boolean {
  return (
    (NON_TERMINAL_RUN_STATUSES as readonly string[]).includes(run.status) &&
    run.createdAt.getTime() < staleRunCutoff(now, thresholdMs).getTime()
  );
}

export function staleRunMessage(thresholdMs: number): string {
  const minutes = Math.round(thresholdMs / 60_000);
  return `Run timed out: no result after ${minutes} minutes (the worker was likely terminated). Held credits were released.`;
}

/** True for the error both ledgers throw when settling a hold twice. */
export function isHoldAlreadySettledError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("hold already settled");
}
