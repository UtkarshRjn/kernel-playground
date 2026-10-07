import {
  CREDIT_VALUE_USD,
  DEFAULT_DAILY_SPEND_LIMIT_USD,
  DEFAULT_SPEND_ALERT_USD,
  evaluateSpendGuard,
  isFlagSet,
  parseUsd,
  SPEND_WINDOW_MS,
  type SpendSnapshot,
} from "@kp/core";
import { TRPCError } from "@trpc/server";
import { prisma } from "./db";

export const spendConfig = () => ({
  runsDisabled: isFlagSet(process.env.KP_RUNS_DISABLED),
  dailyLimitUsd: parseUsd(process.env.KP_DAILY_SPEND_LIMIT_USD, DEFAULT_DAILY_SPEND_LIMIT_USD),
  alertThresholdUsd: parseUsd(process.env.KP_SPEND_ALERT_USD, DEFAULT_SPEND_ALERT_USD),
});

/**
 * Platform-wide GPU spend over the trailing 24h: true provider cost of settled runs plus
 * the credit-hold value (worst case) of runs still queued/running.
 */
export async function getRecentSpend(now = new Date()): Promise<SpendSnapshot & { runCount: number }> {
  const since = new Date(now.getTime() - SPEND_WINDOW_MS);
  const [settled, active] = await Promise.all([
    prisma.run.aggregate({
      where: { createdAt: { gte: since } },
      _sum: { costUsd: true },
      _count: true,
    }),
    prisma.run.findMany({
      where: { createdAt: { gte: since }, status: { in: ["queued", "running"] }, holdId: { not: null } },
      select: { holdId: true },
    }),
  ]);

  const holdIds = active.map((r) => r.holdId).filter((id): id is string => id !== null);
  let heldCredits = 0;
  if (holdIds.length > 0) {
    const holds = await prisma.creditTxn.aggregate({
      where: { kind: "hold", holdId: { in: holdIds } },
      _sum: { amount: true },
    });
    heldCredits = -(holds._sum.amount ?? 0);
  }

  return {
    settledUsd: settled._sum.costUsd ?? 0,
    activeEstimateUsd: heldCredits * CREDIT_VALUE_USD,
    runCount: settled._count,
  };
}

/** Throws SERVICE_UNAVAILABLE when runs are manually disabled or today's spend cap is hit. */
export async function assertSpendAllowsRun(): Promise<void> {
  const { runsDisabled, dailyLimitUsd } = spendConfig();
  const spend = runsDisabled ? { settledUsd: 0, activeEstimateUsd: 0 } : await getRecentSpend();
  const decision = evaluateSpendGuard({ runsDisabled, limitUsd: dailyLimitUsd, spend });
  if (!decision.allowed) {
    console.warn(`[spend-guard] run rejected: ${decision.reason}`, spend);
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: decision.message });
  }
}
