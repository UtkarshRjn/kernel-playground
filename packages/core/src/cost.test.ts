import { describe, expect, it } from "vitest";
import { GPU_CATALOG } from "@kp/shared";
import {
  captureCredits,
  costUsd,
  estimateHoldCredits,
  perfPerDollar,
  usdToCredits,
} from "./cost.js";

describe("cost", () => {
  it("computes USD from GPU price per second", () => {
    expect(costUsd("H100", 10)).toBeCloseTo(GPU_CATALOG.H100.pricePerSec * 10);
  });

  it("rounds credits up so we never undercharge", () => {
    expect(usdToCredits(0.001)).toBe(1);
    expect(usdToCredits(0.01)).toBe(1);
    expect(usdToCredits(0.011)).toBe(2);
    expect(usdToCredits(0)).toBe(0);
  });

  it("hold estimate covers more than actual capture for the same run", () => {
    const hold = estimateHoldCredits("A100_80GB", 60);
    const actual = captureCredits("A100_80GB", 2.5);
    expect(hold).toBeGreaterThan(actual);
  });

  it("perf/$ is higher for cheaper time at equal throughput", () => {
    const onT4 = perfPerDollar(1000, "T4", 1);
    const onH100 = perfPerDollar(1000, "H100", 1);
    expect(onT4).toBeGreaterThan(onH100); // T4 is cheaper per second
  });

  it("rejects negative inputs", () => {
    expect(() => costUsd("T4", -1)).toThrow();
    expect(() => usdToCredits(-1)).toThrow();
  });
});
