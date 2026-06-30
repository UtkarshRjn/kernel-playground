import {
  captureCredits,
  type CreditLedger,
  costUsd,
  estimateHoldCredits,
  type KernelSubmission,
} from "@kp/core";
import type { ExecutionProvider, RunRequest, RunResult, RunStatus } from "@kp/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * Create the run job: size + place the credit hold, persist the Run + per-GPU targets,
 * and return immediately. The actual GPU work happens later in processRun (kicked off via
 * `after()` so the HTTP response isn't held open). Throws InsufficientCreditsError.
 */
export async function submitRun(params: {
  userId: string;
  submission: KernelSubmission;
  ledger: CreditLedger;
}): Promise<{ runId: string; holdId: string }> {
  const { userId, submission, ledger } = params;
  const holdCredits = submission.gpus.reduce(
    (sum, gpu) => sum + estimateHoldCredits(gpu, submission.benchmark.timeoutSec),
    0,
  );
  const holdId = await ledger.placeHold(holdCredits); // throws if insufficient

  const run = await prisma.run.create({
    data: {
      userId,
      status: "queued",
      language: submission.language,
      holdId,
      targets: { create: submission.gpus.map((gpu) => ({ gpu, status: "queued" })) },
    },
  });
  return { runId: run.id, holdId };
}

/** Run every target on the provider, persisting results as they land, then settle credits. */
export async function processRun(params: {
  runId: string;
  holdId: string;
  submission: KernelSubmission;
  provider: ExecutionProvider;
  ledger: CreditLedger;
}): Promise<void> {
  const { runId, holdId, submission, provider, ledger } = params;
  try {
    await runTargets({ runId, holdId, submission, provider, ledger });
  } catch (err) {
    // Unexpected failure: release the hold and mark the run errored so it isn't stuck.
    await ledger.settleHold(holdId, 0).catch(() => {});
    await prisma.run
      .update({
        where: { id: runId },
        data: { status: "error", error: err instanceof Error ? err.message : String(err) },
      })
      .catch(() => {});
  }
}

async function runTargets(params: {
  runId: string;
  holdId: string;
  submission: KernelSubmission;
  provider: ExecutionProvider;
  ledger: CreditLedger;
}): Promise<void> {
  const { runId, holdId, submission, provider, ledger } = params;
  await prisma.run.update({ where: { id: runId }, data: { status: "running" } });

  const requests: RunRequest[] = submission.gpus.map((gpu) => ({
    runId,
    targetId: `${runId}:${gpu}`,
    idempotencyKey: `${runId}:${gpu}`,
    language: submission.language,
    gpu,
    files: submission.files,
    entryPoint: submission.entryPoint,
    compilerFlags: submission.compilerFlags ?? [],
    benchmark: submission.benchmark,
  }));

  let captured = 0;
  let totalCost = 0;
  let anyFailed = false;

  // Run targets concurrently; persist each as it resolves so polling sees progress.
  await Promise.all(
    requests.map(async (req) => {
      let result: RunResult;
      try {
        result = await provider.run(req);
      } catch (err) {
        anyFailed = true;
        await prisma.runTarget.updateMany({
          where: { runId, gpu: req.gpu },
          data: {
            status: "runtime_error",
            diagnostics: `Execution service error — ${err instanceof Error ? err.message : String(err)}`,
          },
        });
        return;
      }
      if (result.status !== "succeeded") anyFailed = true;
      captured += captureCredits(req.gpu, result.gpuSeconds);
      totalCost += costUsd(req.gpu, result.gpuSeconds);
      await prisma.runTarget.updateMany({
        where: { runId, gpu: req.gpu },
        data: {
          status: result.status,
          gpuSeconds: result.gpuSeconds,
          stats: result.stats ? (result.stats as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          diagnostics: result.diagnostics,
        },
      });
    }),
  );

  await ledger.settleHold(holdId, captured);
  await prisma.run.update({
    where: { id: runId },
    data: {
      status: anyFailed ? "partial" : "succeeded",
      creditsCharged: captured,
      costUsd: totalCost,
    },
  });
}

export interface RunStatusView {
  status: string;
  creditsCharged: number;
  costUsd: number;
  targets: Array<Pick<RunResult, "gpu" | "status" | "gpuSeconds" | "stats" | "diagnostics">>;
}

/** Current state of a run for polling — scoped to the owning user. */
export async function getRunStatus(runId: string, userId: string): Promise<RunStatusView | null> {
  const run = await prisma.run.findFirst({
    where: { id: runId, userId },
    include: { targets: true },
  });
  if (!run) return null;
  return {
    status: run.status,
    creditsCharged: run.creditsCharged,
    costUsd: run.costUsd,
    targets: run.targets.map((t) => ({
      gpu: t.gpu as RunResult["gpu"],
      status: t.status as RunStatus,
      gpuSeconds: t.gpuSeconds,
      stats: (t.stats as RunResult["stats"]) ?? null,
      diagnostics: t.diagnostics,
    })),
  };
}
