import type {
  BenchmarkConfig,
  ExecutionProvider,
  GpuType,
  KernelFile,
  KernelLanguage,
  RunRequest,
  RunResult,
} from "@kp/shared";
import { captureCredits, costUsd, estimateHoldCredits } from "./cost.js";
import type { CreditLedger } from "./ledger.js";

/** A user's request to run one kernel across one or more GPUs (§3 fan-out). */
export interface KernelSubmission {
  runId: string;
  language: KernelLanguage;
  files: KernelFile[];
  entryPoint: string;
  gpus: GpuType[];
  compilerFlags?: string[];
  benchmark: BenchmarkConfig;
}

export interface RunReport {
  runId: string;
  targets: RunResult[];
  /** Total real cloud cost in USD across all targets. */
  costUsd: number;
  /** Credits actually captured (charged) for this run. */
  creditsCharged: number;
  /** Ledger balance after settlement. */
  balanceAfter: number;
}

/** Deterministic id for a (run, gpu) target. */
function targetId(runId: string, gpu: GpuType): string {
  return `${runId}:${gpu}`;
}

/**
 * Execute a submission end to end with the credit guardrail (§8) and per-GPU fan-out:
 *
 *   1. size a worst-case hold for every target and reserve it (reject if unaffordable)
 *   2. run each target on the provider (failures are reported, not thrown)
 *   3. capture credits from actual GPU-seconds, release the unused remainder
 *
 * A failed target still captures whatever GPU-seconds it consumed before failing.
 * Provider infra errors capture nothing for that target.
 */
export async function orchestrateRun(
  submission: KernelSubmission,
  provider: ExecutionProvider,
  ledger: CreditLedger,
): Promise<RunReport> {
  if (submission.gpus.length === 0) throw new Error("at least one GPU is required");

  const holdCredits = submission.gpus.reduce(
    (sum, gpu) => sum + estimateHoldCredits(gpu, submission.benchmark.timeoutSec),
    0,
  );
  const holdId = await ledger.placeHold(holdCredits);

  const requests: RunRequest[] = submission.gpus.map((gpu) => ({
    runId: submission.runId,
    targetId: targetId(submission.runId, gpu),
    idempotencyKey: `${submission.runId}:${gpu}`,
    language: submission.language,
    gpu,
    files: submission.files,
    entryPoint: submission.entryPoint,
    compilerFlags: submission.compilerFlags ?? [],
    benchmark: submission.benchmark,
  }));

  const settled = await Promise.allSettled(requests.map((r) => provider.run(r)));

  const targets: RunResult[] = [];
  let totalCostUsd = 0;
  let captured = 0;

  settled.forEach((outcome, i) => {
    const req = requests[i]!;
    if (outcome.status === "fulfilled") {
      const result = outcome.value;
      targets.push(result);
      totalCostUsd += costUsd(result.gpu, result.gpuSeconds);
      captured += captureCredits(result.gpu, result.gpuSeconds);
    } else {
      // Infra/service failure (network, 5xx, billing limit): no usage to charge.
      // Surface the real reason so the console can explain it.
      const reason =
        outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      targets.push({
        runId: submission.runId,
        targetId: req.targetId,
        gpu: req.gpu,
        status: "runtime_error",
        gpuSeconds: 0,
        stats: null,
        metrics: null,
        stdout: "",
        stderr: reason,
        diagnostics: `Execution service error — ${reason}`,
      });
    }
  });

  await ledger.settleHold(holdId, captured);

  return {
    runId: submission.runId,
    targets,
    costUsd: totalCostUsd,
    creditsCharged: captured,
    balanceAfter: await ledger.getBalance(),
  };
}
