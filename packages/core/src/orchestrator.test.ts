import { describe, expect, it } from "vitest";
import type {
  BenchmarkConfig,
  ExecutionProvider,
  RunRequest,
  RunResult,
} from "@kp/shared";
import { InMemoryCreditLedger, InsufficientCreditsError } from "./ledger.js";
import { MockExecutionProvider } from "./mock-provider.js";
import { orchestrateRun, type KernelSubmission } from "./orchestrator.js";

const benchmark: BenchmarkConfig = {
  warmupIters: 2,
  timedIters: 20,
  flushL2: true,
  timeoutSec: 30,
};

function submission(gpus: KernelSubmission["gpus"]): KernelSubmission {
  return {
    runId: "run_1",
    language: "cuda",
    files: [{ path: "kernel.cu", content: "// noop" }],
    entryPoint: "main",
    gpus,
    benchmark,
  };
}

describe("orchestrateRun", () => {
  it("runs every requested GPU as its own target", async () => {
    const ledger = new InMemoryCreditLedger(10_000);
    const report = await orchestrateRun(
      submission(["T4", "A100_80GB", "H100"]),
      new MockExecutionProvider(),
      ledger,
    );
    expect(report.targets).toHaveLength(3);
    expect(report.targets.every((t) => t.status === "succeeded")).toBe(true);
  });

  it("charges credits and leaves the balance reduced by exactly what was captured", async () => {
    const ledger = new InMemoryCreditLedger(10_000);
    const report = await orchestrateRun(submission(["A100_80GB"]), new MockExecutionProvider(), ledger);
    expect(report.creditsCharged).toBeGreaterThan(0);
    expect(report.balanceAfter).toBe(10_000 - report.creditsCharged);
    expect(ledger.heldTotal).toBe(0); // hold fully settled
  });

  it("rejects the run up front when credits can't cover the worst-case hold", async () => {
    const ledger = new InMemoryCreditLedger(0);
    await expect(
      orchestrateRun(submission(["B200"]), new MockExecutionProvider(), ledger),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(ledger.balance).toBe(0); // nothing spent
  });

  it("settles cleanly when one target fails, charging only successful usage", async () => {
    // Provider that throws for H100 but succeeds elsewhere.
    const flaky: ExecutionProvider = {
      name: "flaky",
      async run(req: RunRequest): Promise<RunResult> {
        if (req.gpu === "H100") throw new Error("boom");
        return new MockExecutionProvider().run(req);
      },
      async cancel() {},
    };
    const ledger = new InMemoryCreditLedger(10_000);
    const report = await orchestrateRun(submission(["T4", "H100"]), flaky, ledger);

    const h100 = report.targets.find((t) => t.gpu === "H100");
    const t4 = report.targets.find((t) => t.gpu === "T4");
    expect(h100?.status).toBe("runtime_error");
    expect(t4?.status).toBe("succeeded");
    expect(ledger.heldTotal).toBe(0);
    expect(report.balanceAfter).toBe(10_000 - report.creditsCharged);
  });
});
