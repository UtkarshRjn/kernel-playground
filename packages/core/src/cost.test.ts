import { describe, expect, it } from "vitest";
import { GPU_CATALOG, GpuType } from "@kp/shared";
import { buildComparison } from "./comparison.js";
import {
  type BillingConfig,
  captureCredits,
  chargeUsd,
  COMPILE_OVERHEAD_SEC,
  CONTAINER_CPU_MEMORY_USD_PER_SEC,
  CONTAINER_STARTUP_OVERHEAD_SEC,
  costUsd,
  DEFAULT_BILLING_CONFIG,
  estimateHoldCredits,
  MIN_CREDITS_PER_TARGET,
  perfPerDollar,
  PRICE_MULTIPLIER,
  usdToCredits,
} from "./cost.js";

const NO_MARGIN: BillingConfig = {
  startupOverheadSec: 0,
  priceMultiplier: 1,
  minCreditsPerTarget: 0,
  cpuMemoryUsdPerSec: 0,
};

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
    expect(() => chargeUsd("T4", -1)).toThrow();
  });
});

describe("billing overhead + margin", () => {
  it("charges startup overhead, CPU/memory and markup on top of GPU cost", () => {
    const expected =
      (GPU_CATALOG.H100.pricePerSec + CONTAINER_CPU_MEMORY_USD_PER_SEC) *
      (5 + CONTAINER_STARTUP_OVERHEAD_SEC) *
      PRICE_MULTIPLIER;
    expect(chargeUsd("H100", 5)).toBeCloseTo(expected, 12);
    expect(chargeUsd("H100", 5)).toBeGreaterThan(costUsd("H100", 5) * PRICE_MULTIPLIER);
    expect(captureCredits("H100", 5)).toBe(usdToCredits(expected));
  });

  it("always charges more than true provider cost", () => {
    for (const gpu of GpuType.options) {
      for (const s of [0, 0.5, 5, 60]) {
        expect(chargeUsd(gpu, s)).toBeGreaterThan(costUsd(gpu, s));
      }
    }
  });

  it("charges at least the per-target minimum, even for zero measured seconds", () => {
    expect(captureCredits("T4", 0)).toBeGreaterThanOrEqual(MIN_CREDITS_PER_TARGET);
    expect(captureCredits("T4", 0, { ...NO_MARGIN, minCreditsPerTarget: 3 })).toBe(3);
    expect(captureCredits("T4", 0, NO_MARGIN)).toBe(0);
  });

  it("with overhead and margin disabled, charge equals raw GPU cost", () => {
    expect(chargeUsd("A100_40GB", 12, NO_MARGIN)).toBeCloseTo(costUsd("A100_40GB", 12), 12);
  });

  it("honours injected config", () => {
    const pricey = { ...DEFAULT_BILLING_CONFIG, priceMultiplier: 2, startupOverheadSec: 30 };
    expect(captureCredits("H100", 5, pricey)).toBeGreaterThan(captureCredits("H100", 5));
  });

  it("hold is >= the max possible capture for every GPU, timeout and config", () => {
    const configs: BillingConfig[] = [
      DEFAULT_BILLING_CONFIG,
      NO_MARGIN,
      { ...DEFAULT_BILLING_CONFIG, priceMultiplier: 3, startupOverheadSec: 45, minCreditsPerTarget: 5 },
    ];
    for (const config of configs) {
      for (const gpu of GpuType.options) {
        for (const timeoutSec of [1, 10, 30, 60, 300]) {
          const hold = estimateHoldCredits(gpu, timeoutSec, config);
          const maxSec = timeoutSec + COMPILE_OVERHEAD_SEC;
          for (let i = 0; i <= 50; i++) {
            const s = (maxSec * i) / 50;
            expect(captureCredits(gpu, s, config)).toBeLessThanOrEqual(hold);
          }
        }
      }
    }
  });

  it("perf/$ and comparison cost use true GPU price, not marked-up price", () => {
    const [row] = buildComparison([
      {
        gpu: "H100",
        status: "succeeded",
        gpuSeconds: 5,
        stats: { meanMs: 1, medianMs: 1, minMs: 1, p95Ms: 1, stddevMs: 0, iters: 1 },
      },
    ]).rows;
    expect(row!.costUsd).toBeCloseTo(GPU_CATALOG.H100.pricePerSec * 5, 12);
    expect(row!.speedPerDollar).toBeCloseTo(1 / GPU_CATALOG.H100.pricePerSec, 6);
    expect(perfPerDollar(1000, "H100", 5)).toBeCloseTo(1000 / costUsd("H100", 5), 6);
  });
});
