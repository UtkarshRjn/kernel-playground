import { describe, expect, it } from "vitest";
import {
  evaluateFixedWindows,
  evaluateRunAdmission,
  formatWait,
  parseLimit,
  windowResetInMs,
  windowStart,
  type RunAdmissionLimits,
} from "./rate-limit.js";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("fixed window math", () => {
  it("aligns window start to multiples of the window size", () => {
    expect(windowStart(0, MIN)).toBe(0);
    expect(windowStart(MIN - 1, MIN)).toBe(0);
    expect(windowStart(MIN, MIN)).toBe(MIN);
    expect(windowStart(5 * DAY + 123, DAY)).toBe(5 * DAY);
  });

  it("computes time until reset", () => {
    expect(windowResetInMs(0, MIN)).toBe(MIN);
    expect(windowResetInMs(MIN - 1, MIN)).toBe(1);
    expect(windowResetInMs(30_000, MIN)).toBe(30_000);
  });
});

describe("formatWait", () => {
  it("rounds up to coarse units", () => {
    expect(formatWait(0)).toBe("1s");
    expect(formatWait(1_500)).toBe("2s");
    expect(formatWait(59_000)).toBe("59s");
    expect(formatWait(61_000)).toBe("2m");
    expect(formatWait(HOUR)).toBe("1h");
    expect(formatWait(HOUR + 1)).toBe("2h");
  });
});

describe("parseLimit", () => {
  it("falls back on missing or invalid values", () => {
    expect(parseLimit(undefined, 5)).toBe(5);
    expect(parseLimit("", 5)).toBe(5);
    expect(parseLimit("abc", 5)).toBe(5);
    expect(parseLimit("-1", 5)).toBe(5);
    expect(parseLimit("1.5", 5)).toBe(5);
  });

  it("accepts non-negative integers including 0", () => {
    expect(parseLimit("0", 5)).toBe(0);
    expect(parseLimit(" 42 ", 5)).toBe(42);
  });
});

describe("evaluateFixedWindows", () => {
  const rules = [
    { label: "per minute", limit: 30, windowMs: MIN },
    { label: "per day", limit: 300, windowMs: DAY },
  ];
  const now = 10 * DAY + 20_000; // 20s into a minute window

  it("allows requests at the limit (counts include the current request)", () => {
    expect(evaluateFixedWindows(rules, [30, 300], now, "tests")).toEqual({ allowed: true });
  });

  it("blocks over the per-minute limit with a reset hint", () => {
    const d = evaluateFixedWindows(rules, [31, 31], now, "tests");
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.reason).toBe("rate");
    expect(d.retryAfterMs).toBe(40_000);
    expect(d.message).toBe("Rate limit reached: at most 30 tests per minute. Try again in 40s.");
  });

  it("reports the longest-blocking window when several are exceeded", () => {
    const d = evaluateFixedWindows(rules, [31, 301], now, "tests");
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.message).toContain("300 tests per day");
    expect(d.retryAfterMs).toBe(DAY - 20_000);
  });

  it("a limit of 0 blocks everything", () => {
    const d = evaluateFixedWindows([{ label: "per minute", limit: 0, windowMs: MIN }], [1], now, "tests");
    expect(d.allowed).toBe(false);
  });
});

describe("evaluateRunAdmission", () => {
  const limits: RunAdmissionLimits = {
    maxActivePerUser: 2,
    maxActiveGlobal: 20,
    maxSubmitsPerWindow: 20,
    submitWindowMs: HOUR,
  };
  const now = 1_000 * HOUR;

  it("admits under all limits", () => {
    expect(
      evaluateRunAdmission({ userActive: 1, globalActive: 19, userRecentSubmits: 19 }, limits, now),
    ).toEqual({ allowed: true });
  });

  it("caps per-user concurrency", () => {
    const d = evaluateRunAdmission({ userActive: 2, globalActive: 2, userRecentSubmits: 2 }, limits, now);
    expect(d).toMatchObject({ allowed: false, reason: "user_concurrency" });
    if (!d.allowed) expect(d.message).toContain("2 runs in progress (max 2)");
  });

  it("caps global concurrency", () => {
    const d = evaluateRunAdmission({ userActive: 0, globalActive: 20, userRecentSubmits: 0 }, limits, now);
    expect(d).toMatchObject({ allowed: false, reason: "global_concurrency" });
  });

  it("caps submits per sliding window and hints when the oldest one ages out", () => {
    const d = evaluateRunAdmission(
      {
        userActive: 0,
        globalActive: 0,
        userRecentSubmits: 20,
        oldestRecentSubmitMs: now - HOUR + 5 * MIN,
      },
      limits,
      now,
    );
    expect(d).toMatchObject({ allowed: false, reason: "rate", retryAfterMs: 5 * MIN });
    if (!d.allowed) expect(d.message).toBe("Rate limit reached: at most 20 runs per 1h. Try again in 5m.");
  });

  it("checks the rate limit before concurrency", () => {
    const d = evaluateRunAdmission({ userActive: 5, globalActive: 50, userRecentSubmits: 20 }, limits, now);
    expect(d).toMatchObject({ allowed: false, reason: "rate" });
  });
});
