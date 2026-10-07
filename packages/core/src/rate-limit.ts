/**
 * Pure rate-limit / concurrency decisions. Storage (counting rows, bumping counters) lives
 * in the web app; everything here is deterministic so it can be unit-tested.
 */

export type RateLimitDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "rate" | "user_concurrency" | "global_concurrency";
      message: string;
      /** Best-effort hint for when retrying may succeed; undefined when unknown. */
      retryAfterMs?: number;
    };

export interface FixedWindowRule {
  /** Human label used in messages, e.g. "per minute". */
  label: string;
  limit: number;
  windowMs: number;
}

/** Start (epoch ms) of the fixed window containing `nowMs`. */
export function windowStart(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs) * windowMs;
}

/** Milliseconds until the fixed window containing `nowMs` resets. */
export function windowResetInMs(nowMs: number, windowMs: number): number {
  return windowStart(nowMs, windowMs) + windowMs - nowMs;
}

/** "45s", "12m", "3h" — coarse, rounded up, for user-facing messages. */
export function formatWait(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.ceil(m / 60)}h`;
}

/**
 * Parse a positive integer limit from an env var; falls back on missing/invalid input.
 * `0` is allowed and means "block everything" (useful as a kill switch).
 */
export function parseLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/**
 * Decide on fixed-window counters. `counts[i]` is the count for `rules[i]`'s current window
 * *including* the request being evaluated (i.e. counters are incremented before checking).
 */
export function evaluateFixedWindows(
  rules: FixedWindowRule[],
  counts: number[],
  nowMs: number,
  action: string,
): RateLimitDecision {
  let worst: { rule: FixedWindowRule; resetMs: number } | undefined;
  rules.forEach((rule, i) => {
    if ((counts[i] ?? 0) <= rule.limit) return;
    const resetMs = windowResetInMs(nowMs, rule.windowMs);
    if (!worst || resetMs > worst.resetMs) worst = { rule, resetMs };
  });
  if (!worst) return { allowed: true };
  return {
    allowed: false,
    reason: "rate",
    message: `Rate limit reached: at most ${worst.rule.limit} ${action} ${worst.rule.label}. Try again in ${formatWait(worst.resetMs)}.`,
    retryAfterMs: worst.resetMs,
  };
}

export interface RunAdmissionLimits {
  maxActivePerUser: number;
  maxActiveGlobal: number;
  maxSubmitsPerWindow: number;
  submitWindowMs: number;
}

export interface RunAdmissionCounts {
  /** User's runs currently queued or running. */
  userActive: number;
  /** All users' runs currently queued or running. */
  globalActive: number;
  /** User's submits within the trailing `submitWindowMs`. */
  userRecentSubmits: number;
  /** createdAt (epoch ms) of the user's oldest submit within the window, if any. */
  oldestRecentSubmitMs?: number;
}

/** Admission check for a new GPU run (counts exclude the run being submitted). */
export function evaluateRunAdmission(
  counts: RunAdmissionCounts,
  limits: RunAdmissionLimits,
  nowMs: number,
): RateLimitDecision {
  if (counts.userRecentSubmits >= limits.maxSubmitsPerWindow) {
    const retryAfterMs =
      counts.oldestRecentSubmitMs !== undefined
        ? Math.max(0, counts.oldestRecentSubmitMs + limits.submitWindowMs - nowMs)
        : undefined;
    return {
      allowed: false,
      reason: "rate",
      message:
        `Rate limit reached: at most ${limits.maxSubmitsPerWindow} runs per ${formatWait(limits.submitWindowMs)}.` +
        (retryAfterMs !== undefined ? ` Try again in ${formatWait(retryAfterMs)}.` : ""),
      retryAfterMs,
    };
  }
  if (counts.userActive >= limits.maxActivePerUser) {
    return {
      allowed: false,
      reason: "user_concurrency",
      message: `You already have ${counts.userActive} run${counts.userActive === 1 ? "" : "s"} in progress (max ${limits.maxActivePerUser}). Wait for one to finish, then submit again.`,
    };
  }
  if (counts.globalActive >= limits.maxActiveGlobal) {
    return {
      allowed: false,
      reason: "global_concurrency",
      message: "All GPU slots are busy right now. Please try again in a minute.",
    };
  }
  return { allowed: true };
}
