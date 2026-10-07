import {
  isHoldAlreadySettledError,
  NON_TERMINAL_RUN_STATUSES,
  NON_TERMINAL_TARGET_STATUSES,
  resolveStaleRunThresholdMs,
  staleRunCutoff,
  staleRunMessage,
} from "@kp/core";
import { PrismaCreditLedger } from "./credit-ledger";
import { prisma } from "./db";

export function staleRunThresholdMs(): number {
  return resolveStaleRunThresholdMs(process.env.RUN_STALE_AFTER_SEC);
}

type StaleRun = { id: string; userId: string; holdId: string | null };

/**
 * Fail one stale run and release its hold. The conditional status update is the claim:
 * only one caller (sweeper, lazy status check, or processRun) can move a run out of a
 * non-terminal state, so the hold is settled at most once. Returns whether we claimed it.
 */
export async function sweepRun(run: StaleRun, thresholdMs = staleRunThresholdMs()): Promise<boolean> {
  const message = staleRunMessage(thresholdMs);
  const claimed = await prisma.run.updateMany({
    where: { id: run.id, status: { in: [...NON_TERMINAL_RUN_STATUSES] } },
    data: { status: "error", error: message },
  });
  if (claimed.count === 0) return false;

  await prisma.runTarget.updateMany({
    where: { runId: run.id, status: { in: [...NON_TERMINAL_TARGET_STATUSES] } },
    data: { status: "timeout", diagnostics: message },
  });

  if (run.holdId) {
    const account = await prisma.creditAccount.findUnique({ where: { userId: run.userId } });
    if (account) {
      try {
        await new PrismaCreditLedger(prisma, account.id).settleHold(run.holdId, 0);
      } catch (err) {
        if (!isHoldAlreadySettledError(err)) throw err;
      }
    }
  }
  return true;
}

export interface SweepResult {
  thresholdMs: number;
  candidates: number;
  swept: number;
  failed: number;
}

/** Find runs stuck in queued/running past the threshold, mark them errored, release holds. */
export async function sweepStaleRuns(opts: { now?: Date; limit?: number } = {}): Promise<SweepResult> {
  const thresholdMs = staleRunThresholdMs();
  const cutoff = staleRunCutoff(opts.now ?? new Date(), thresholdMs);
  const runs = await prisma.run.findMany({
    where: { status: { in: [...NON_TERMINAL_RUN_STATUSES] }, createdAt: { lt: cutoff } },
    select: { id: true, userId: true, holdId: true },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 200,
  });

  let swept = 0;
  let failed = 0;
  for (const run of runs) {
    try {
      if (await sweepRun(run, thresholdMs)) swept++;
    } catch (err) {
      failed++;
      console.error(`[sweep-runs] failed to sweep run ${run.id}:`, err);
    }
  }
  return { thresholdMs, candidates: runs.length, swept, failed };
}
