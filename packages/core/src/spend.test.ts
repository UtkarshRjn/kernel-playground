import { describe, expect, it } from "vitest";
import {
  buildSpendReport,
  evaluateSpendGuard,
  isFlagSet,
  parseUsd,
  webhookPayload,
} from "./spend.js";

describe("parseUsd", () => {
  it("falls back when unset, blank, negative, or not a number", () => {
    expect(parseUsd(undefined, 25)).toBe(25);
    expect(parseUsd("", 25)).toBe(25);
    expect(parseUsd("  ", 25)).toBe(25);
    expect(parseUsd("-1", 25)).toBe(25);
    expect(parseUsd("abc", 25)).toBe(25);
    expect(parseUsd("Infinity", 25)).toBe(25);
  });
  it("parses valid amounts, including 0", () => {
    expect(parseUsd("12.5", 25)).toBe(12.5);
    expect(parseUsd("0", 25)).toBe(0);
  });
});

describe("isFlagSet", () => {
  it.each(["1", "true", "TRUE", " yes ", "on"])("treats %j as set", (v) => {
    expect(isFlagSet(v)).toBe(true);
  });
  it.each([undefined, "", "0", "false", "no", "off"])("treats %j as unset", (v) => {
    expect(isFlagSet(v)).toBe(false);
  });
});

describe("evaluateSpendGuard", () => {
  const spend = (settledUsd: number, activeEstimateUsd = 0) => ({ settledUsd, activeEstimateUsd });

  it("allows runs under the limit", () => {
    expect(evaluateSpendGuard({ runsDisabled: false, limitUsd: 25, spend: spend(10, 5) })).toEqual({
      allowed: true,
    });
  });

  it("blocks once settled + in-flight reaches the limit", () => {
    const d = evaluateSpendGuard({ runsDisabled: false, limitUsd: 25, spend: spend(20, 5) });
    expect(d).toMatchObject({ allowed: false, reason: "daily_limit" });
  });

  it("counts in-flight estimates toward the limit", () => {
    expect(evaluateSpendGuard({ runsDisabled: false, limitUsd: 25, spend: spend(1, 30) }).allowed).toBe(
      false,
    );
  });

  it("manual kill switch wins regardless of spend", () => {
    const d = evaluateSpendGuard({ runsDisabled: true, limitUsd: 25, spend: spend(0) });
    expect(d).toMatchObject({ allowed: false, reason: "runs_disabled" });
    if (!d.allowed) expect(d.message).toMatch(/paused for today/);
  });

  it("a limit of 0 blocks everything", () => {
    expect(evaluateSpendGuard({ runsDisabled: false, limitUsd: 0, spend: spend(0) }).allowed).toBe(false);
  });
});

describe("buildSpendReport", () => {
  it("does not alert below the threshold", () => {
    const r = buildSpendReport({
      spend: { settledUsd: 3, activeEstimateUsd: 1 },
      runCount: 7,
      alertThresholdUsd: 10,
      dailyLimitUsd: 25,
    });
    expect(r.shouldAlert).toBe(false);
    expect(r.totalUsd).toBe(4);
    expect(r.text).toContain("$4.00");
    expect(r.text).toContain("7 runs");
    expect(r.text).toContain("16% used");
  });

  it("alerts at or above the threshold and flags manual disable", () => {
    const r = buildSpendReport({
      spend: { settledUsd: 9, activeEstimateUsd: 1 },
      runCount: 40,
      alertThresholdUsd: 10,
      dailyLimitUsd: 25,
      runsDisabled: true,
    });
    expect(r.shouldAlert).toBe(true);
    expect(r.text).toMatch(/^:warning:/);
    expect(r.text).toContain("KP_RUNS_DISABLED");
  });
});

describe("webhookPayload", () => {
  it("sends both Slack and Discord keys, truncating Discord content", () => {
    const long = "x".repeat(2500);
    const p = webhookPayload(long);
    expect(p.text).toHaveLength(2500);
    expect(p.content).toHaveLength(2000);
  });
});
