import { describe, expect, it } from "vitest";
import { InMemoryCreditLedger } from "./ledger.js";
import {
  DEFAULT_STALE_RUN_THRESHOLD_SEC,
  isHoldAlreadySettledError,
  isRunStale,
  MIN_STALE_RUN_THRESHOLD_SEC,
  resolveStaleRunThresholdMs,
  staleRunCutoff,
  staleRunMessage,
} from "./stale-runs.js";

describe("resolveStaleRunThresholdMs", () => {
  it("defaults when unset, empty, or invalid", () => {
    const def = DEFAULT_STALE_RUN_THRESHOLD_SEC * 1000;
    expect(resolveStaleRunThresholdMs(undefined)).toBe(def);
    expect(resolveStaleRunThresholdMs("")).toBe(def);
    expect(resolveStaleRunThresholdMs("abc")).toBe(def);
    expect(resolveStaleRunThresholdMs("-5")).toBe(def);
    expect(resolveStaleRunThresholdMs("0")).toBe(def);
  });

  it("uses a valid configured value", () => {
    expect(resolveStaleRunThresholdMs("1800")).toBe(1_800_000);
  });

  it("clamps values below the minimum", () => {
    expect(resolveStaleRunThresholdMs("60")).toBe(MIN_STALE_RUN_THRESHOLD_SEC * 1000);
  });

  it("default exceeds the minimum (the max possible run time)", () => {
    expect(DEFAULT_STALE_RUN_THRESHOLD_SEC).toBeGreaterThanOrEqual(MIN_STALE_RUN_THRESHOLD_SEC);
    expect(MIN_STALE_RUN_THRESHOLD_SEC).toBeGreaterThan(300);
  });
});

describe("isRunStale", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const threshold = 15 * 60_000;
  const old = new Date(now.getTime() - threshold - 1);
  const fresh = new Date(now.getTime() - threshold + 1000);

  it("flags old queued/running runs", () => {
    expect(isRunStale({ status: "queued", createdAt: old }, now, threshold)).toBe(true);
    expect(isRunStale({ status: "running", createdAt: old }, now, threshold)).toBe(true);
  });

  it("ignores fresh runs", () => {
    expect(isRunStale({ status: "running", createdAt: fresh }, now, threshold)).toBe(false);
  });

  it("is not stale exactly at the cutoff", () => {
    const atCutoff = staleRunCutoff(now, threshold);
    expect(isRunStale({ status: "running", createdAt: atCutoff }, now, threshold)).toBe(false);
  });

  it("ignores terminal runs regardless of age", () => {
    for (const status of ["succeeded", "partial", "error"]) {
      expect(isRunStale({ status, createdAt: old }, now, threshold)).toBe(false);
    }
  });
});

describe("staleRunMessage", () => {
  it("mentions the threshold in minutes and the credit release", () => {
    const msg = staleRunMessage(15 * 60_000);
    expect(msg).toContain("15 minutes");
    expect(msg).toContain("credits were released");
  });
});

describe("isHoldAlreadySettledError", () => {
  it("matches the ledger's double-settle error only", async () => {
    const l = new InMemoryCreditLedger(100);
    const hold = await l.placeHold(10);
    await l.settleHold(hold, 0);
    const err = await l.settleHold(hold, 0).catch((e: unknown) => e);
    expect(isHoldAlreadySettledError(err)).toBe(true);

    const unknown = await l.settleHold("nope", 0).catch((e: unknown) => e);
    expect(isHoldAlreadySettledError(unknown)).toBe(false);
    expect(isHoldAlreadySettledError("hold already settled")).toBe(false);
  });
});
