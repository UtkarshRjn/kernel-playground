import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_GITHUB_ACCOUNT_AGE_DAYS,
  DEFAULT_STARTER_CREDITS,
  decideStarterCredits,
  parseNonNegativeInt,
  starterCreditConfigFromEnv,
} from "./starter-credits.js";

const NOW = new Date("2026-10-07T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000).toISOString();
const config = { starterCredits: 200, minGithubAccountAgeDays: 30 };

describe("parseNonNegativeInt", () => {
  it("parses plain non-negative integers", () => {
    expect(parseNonNegativeInt("0", 5)).toBe(0);
    expect(parseNonNegativeInt(" 150 ", 5)).toBe(150);
  });

  it("falls back on missing, malformed, negative, fractional or oversized values", () => {
    for (const raw of [undefined, "", "abc", "-1", "1.5", "1e3", "0x10", "12abc", "Infinity"]) {
      expect(parseNonNegativeInt(raw, 7)).toBe(7);
    }
    expect(parseNonNegativeInt("1001", 7, 1000)).toBe(7);
    expect(parseNonNegativeInt("99999999999999999999", 7)).toBe(7);
  });
});

describe("starterCreditConfigFromEnv", () => {
  it("uses defaults when unset", () => {
    expect(starterCreditConfigFromEnv({})).toEqual({
      starterCredits: DEFAULT_STARTER_CREDITS,
      minGithubAccountAgeDays: DEFAULT_MIN_GITHUB_ACCOUNT_AGE_DAYS,
    });
    expect(DEFAULT_STARTER_CREDITS).toBe(200);
  });

  it("reads overrides and rejects junk", () => {
    expect(
      starterCreditConfigFromEnv({ KP_STARTER_CREDITS: "50", KP_MIN_GITHUB_ACCOUNT_AGE_DAYS: "0" }),
    ).toEqual({ starterCredits: 50, minGithubAccountAgeDays: 0 });
    expect(starterCreditConfigFromEnv({ KP_STARTER_CREDITS: "-500" }).starterCredits).toBe(200);
    expect(starterCreditConfigFromEnv({ KP_STARTER_CREDITS: "10000000" }).starterCredits).toBe(200);
  });
});

describe("decideStarterCredits", () => {
  it("grants to GitHub accounts older than the minimum age", () => {
    expect(decideStarterCredits("github", { created_at: daysAgo(31) }, config, NOW)).toEqual({
      credits: 200,
      reason: "eligible",
    });
    expect(decideStarterCredits("github", { created_at: daysAgo(30) }, config, NOW).credits).toBe(
      200,
    );
  });

  it("denies GitHub accounts that are too new or lack created_at", () => {
    expect(decideStarterCredits("github", { created_at: daysAgo(29) }, config, NOW)).toEqual({
      credits: 0,
      reason: "github_account_too_new",
    });
    expect(decideStarterCredits("github", {}, config, NOW).reason).toBe(
      "github_created_at_missing",
    );
    expect(decideStarterCredits("github", { created_at: "garbage" }, config, NOW).credits).toBe(0);
    expect(decideStarterCredits("github", undefined, config, NOW).credits).toBe(0);
  });

  it("skips the GitHub age check when the minimum is 0", () => {
    const noAge = { ...config, minGithubAccountAgeDays: 0 };
    expect(decideStarterCredits("github", {}, noAge, NOW).credits).toBe(200);
  });

  it("requires a verified email for Google", () => {
    expect(decideStarterCredits("google", { email_verified: true }, config, NOW).credits).toBe(200);
    for (const v of [false, "true", undefined]) {
      expect(decideStarterCredits("google", { email_verified: v }, config, NOW)).toEqual({
        credits: 0,
        reason: "google_email_unverified",
      });
    }
  });

  it("grants nothing for unknown providers or when disabled", () => {
    expect(decideStarterCredits("credentials", {}, config, NOW).reason).toBe(
      "unsupported_provider",
    );
    expect(
      decideStarterCredits("google", { email_verified: true }, { ...config, starterCredits: 0 }, NOW),
    ).toEqual({ credits: 0, reason: "disabled" });
  });
});
