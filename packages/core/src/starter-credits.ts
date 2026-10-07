/**
 * Starter-credit policy: how many free credits a brand-new account gets.
 * Pure (no I/O) so it can be unit tested; the web app feeds it env + OAuth profile.
 */

/** Default starter grant: 200 credits = $2. */
export const DEFAULT_STARTER_CREDITS = 200;
/** Default minimum GitHub account age before starter credits are granted. */
export const DEFAULT_MIN_GITHUB_ACCOUNT_AGE_DAYS = 30;

/** Upper bound so a typo in env (e.g. an extra zero or two) can't hand out a fortune. */
const MAX_STARTER_CREDITS = 100_000;
const MAX_ACCOUNT_AGE_DAYS = 3650;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface StarterCreditConfig {
  starterCredits: number;
  minGithubAccountAgeDays: number;
}

/** Parse a non-negative integer env value; anything else (or out of range) falls back. */
export function parseNonNegativeInt(
  raw: string | undefined,
  fallback: number,
  max: number = Number.MAX_SAFE_INTEGER,
): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return fallback;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n <= max ? n : fallback;
}

export function starterCreditConfigFromEnv(
  env: Record<string, string | undefined>,
): StarterCreditConfig {
  return {
    starterCredits: parseNonNegativeInt(
      env.KP_STARTER_CREDITS,
      DEFAULT_STARTER_CREDITS,
      MAX_STARTER_CREDITS,
    ),
    minGithubAccountAgeDays: parseNonNegativeInt(
      env.KP_MIN_GITHUB_ACCOUNT_AGE_DAYS,
      DEFAULT_MIN_GITHUB_ACCOUNT_AGE_DAYS,
      MAX_ACCOUNT_AGE_DAYS,
    ),
  };
}

export type StarterCreditReason =
  | "eligible"
  | "disabled"
  | "github_account_too_new"
  | "github_created_at_missing"
  | "google_email_unverified"
  | "unsupported_provider";

export interface StarterCreditDecision {
  credits: number;
  reason: StarterCreditReason;
}

/**
 * Decide the starter grant from the OAuth provider id and its raw profile.
 * Fails closed: missing/unparseable signals mean 0 credits (sign-in itself is never blocked).
 */
export function decideStarterCredits(
  provider: string,
  profile: Record<string, unknown> | undefined,
  config: StarterCreditConfig,
  now: Date = new Date(),
): StarterCreditDecision {
  if (config.starterCredits <= 0) return { credits: 0, reason: "disabled" };
  const grant: StarterCreditDecision = { credits: config.starterCredits, reason: "eligible" };

  if (provider === "github") {
    if (config.minGithubAccountAgeDays <= 0) return grant;
    const createdAt = profile?.created_at;
    const createdMs = typeof createdAt === "string" ? Date.parse(createdAt) : Number.NaN;
    if (Number.isNaN(createdMs)) return { credits: 0, reason: "github_created_at_missing" };
    const ageMs = now.getTime() - createdMs;
    return ageMs >= config.minGithubAccountAgeDays * DAY_MS
      ? grant
      : { credits: 0, reason: "github_account_too_new" };
  }

  if (provider === "google") {
    return profile?.email_verified === true
      ? grant
      : { credits: 0, reason: "google_email_unverified" };
  }

  return { credits: 0, reason: "unsupported_provider" };
}
