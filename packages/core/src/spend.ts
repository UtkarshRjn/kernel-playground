/**
 * Platform-wide cost guardrails (independent of per-user credits): a global daily
 * spend kill-switch for new runs and a threshold for operator alerts. Pure logic —
 * callers pass raw env strings and spend totals from the database.
 */

export const DEFAULT_DAILY_SPEND_LIMIT_USD = 25;
export const DEFAULT_SPEND_ALERT_USD = 10;
export const SPEND_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Parse a non-negative USD amount from env; falls back to `fallback` when unset or invalid. */
export function parseUsd(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** "1", "true", "yes", "on" (case-insensitive) are truthy; anything else is false. */
export function isFlagSet(raw: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((raw ?? "").trim().toLowerCase());
}

export interface SpendSnapshot {
  /** True provider cost of settled runs in the window. */
  settledUsd: number;
  /** Worst-case estimate for runs still queued/running in the window. */
  activeEstimateUsd: number;
}

export const totalSpendUsd = (s: SpendSnapshot): number => s.settledUsd + s.activeEstimateUsd;

export type SpendGuardDecision =
  | { allowed: true }
  | { allowed: false; reason: "runs_disabled" | "daily_limit"; message: string };

export const RUNS_PAUSED_MESSAGE =
  "GPU capacity is paused for today. Please try again later — your credits are untouched.";

/**
 * Decide whether a new run may be accepted. The limit is inclusive of in-flight runs so a
 * burst of concurrent submits can't blow past it. A limit of 0 blocks every run.
 */
export function evaluateSpendGuard(params: {
  runsDisabled: boolean;
  limitUsd: number;
  spend: SpendSnapshot;
}): SpendGuardDecision {
  if (params.runsDisabled) {
    return { allowed: false, reason: "runs_disabled", message: RUNS_PAUSED_MESSAGE };
  }
  if (totalSpendUsd(params.spend) >= params.limitUsd) {
    return { allowed: false, reason: "daily_limit", message: RUNS_PAUSED_MESSAGE };
  }
  return { allowed: true };
}

export interface SpendReport {
  totalUsd: number;
  settledUsd: number;
  activeEstimateUsd: number;
  runCount: number;
  alertThresholdUsd: number;
  dailyLimitUsd: number;
  shouldAlert: boolean;
  text: string;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

/** Build the 24h spend report and decide whether it crosses the alert threshold. */
export function buildSpendReport(params: {
  spend: SpendSnapshot;
  runCount: number;
  alertThresholdUsd: number;
  dailyLimitUsd: number;
  runsDisabled?: boolean;
}): SpendReport {
  const totalUsd = totalSpendUsd(params.spend);
  const shouldAlert = totalUsd >= params.alertThresholdUsd;
  const pct = params.dailyLimitUsd > 0 ? Math.round((totalUsd / params.dailyLimitUsd) * 100) : 100;
  const lines = [
    `${shouldAlert ? ":warning: " : ""}Kernel Playground GPU spend (last 24h): ${usd(totalUsd)}`,
    `• settled: ${usd(params.spend.settledUsd)} across ${params.runCount} runs`,
    `• in-flight estimate: ${usd(params.spend.activeEstimateUsd)}`,
    `• alert threshold: ${usd(params.alertThresholdUsd)} | kill-switch limit: ${usd(params.dailyLimitUsd)} (${pct}% used)`,
  ];
  if (params.runsDisabled) lines.push("• runs are manually disabled (KP_RUNS_DISABLED)");
  return {
    totalUsd,
    settledUsd: params.spend.settledUsd,
    activeEstimateUsd: params.spend.activeEstimateUsd,
    runCount: params.runCount,
    alertThresholdUsd: params.alertThresholdUsd,
    dailyLimitUsd: params.dailyLimitUsd,
    shouldAlert,
    text: lines.join("\n"),
  };
}

/** Webhook body accepted by both Slack (`text`) and Discord (`content`) incoming webhooks. */
export function webhookPayload(text: string): { text: string; content: string } {
  // Discord rejects `content` longer than 2000 chars.
  return { text, content: text.slice(0, 2000) };
}
