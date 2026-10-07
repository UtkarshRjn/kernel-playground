import {
  evaluateFixedWindows,
  evaluateRunAdmission,
  parseLimit,
  windowStart,
  type FixedWindowRule,
  type RateLimitDecision,
} from "@kp/core";
import { TRPCError } from "@trpc/server";
import { prisma } from "./db";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const ACTIVE_STATUSES = ["queued", "running"];

/** Fraction of checks that also prune expired counter rows (keeps the table small). */
const PRUNE_PROBABILITY = 0.01;

function limitsFromEnv() {
  const env = process.env;
  return {
    testPerMinute: parseLimit(env.RATE_LIMIT_TEST_PER_MINUTE, 30),
    testPerDay: parseLimit(env.RATE_LIMIT_TEST_PER_DAY, 300),
    submitPerHour: parseLimit(env.RATE_LIMIT_SUBMIT_PER_HOUR, 20),
    maxActivePerUser: parseLimit(env.MAX_ACTIVE_RUNS_PER_USER, 2),
    maxActiveGlobal: parseLimit(env.MAX_ACTIVE_RUNS_GLOBAL, 20),
  };
}

function enforce(decision: RateLimitDecision): void {
  if (!decision.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: decision.message });
}

/**
 * Per-user fixed-window limit for `run.test`. Counters live in Postgres so every serverless
 * instance shares them; the increment is a single atomic upsert, then we check the new count.
 */
export async function enforceTestRateLimit(userId: string): Promise<void> {
  const limits = limitsFromEnv();
  const now = Date.now();
  const rules: (FixedWindowRule & { name: string })[] = [
    { name: "min", label: "per minute", limit: limits.testPerMinute, windowMs: MIN },
    { name: "day", label: "per day", limit: limits.testPerDay, windowMs: DAY },
  ];

  const counts = await Promise.all(
    rules.map(async (r) => {
      const start = windowStart(now, r.windowMs);
      const key = `test:${userId}:${r.name}:${start / r.windowMs}`;
      const expiresSec = (start + r.windowMs) / 1000;
      // `AT TIME ZONE 'UTC'` matches how Prisma stores DateTime, independent of session TZ.
      const rows = await prisma.$queryRaw<{ count: number }[]>`
        INSERT INTO "RateLimitCounter" ("key", "count", "expiresAt")
        VALUES (${key}, 1, to_timestamp(${expiresSec}::double precision) AT TIME ZONE 'UTC')
        ON CONFLICT ("key")
        DO UPDATE SET "count" = "RateLimitCounter"."count" + 1
        RETURNING "count"`;
      return Number(rows[0]?.count ?? 0);
    }),
  );

  if (Math.random() < PRUNE_PROBABILITY) {
    void prisma.rateLimitCounter
      .deleteMany({ where: { expiresAt: { lt: new Date(now) } } })
      .catch(() => {});
  }

  enforce(evaluateFixedWindows(rules, counts, now, "tests"));
}

/**
 * Admission check for `run.submit`, derived from the existing Run table: per-user submits in
 * the trailing hour, per-user active runs, and global active runs. Soft caps — two requests
 * racing can each pass the check — which is acceptable for abuse/cost protection.
 */
export async function enforceSubmitLimits(userId: string): Promise<void> {
  const limits = limitsFromEnv();
  const now = Date.now();
  const since = new Date(now - HOUR);

  const [userActive, globalActive, recent] = await Promise.all([
    prisma.run.count({ where: { userId, status: { in: ACTIVE_STATUSES } } }),
    prisma.run.count({ where: { status: { in: ACTIVE_STATUSES } } }),
    prisma.run.aggregate({
      where: { userId, createdAt: { gte: since } },
      _count: { _all: true },
      _min: { createdAt: true },
    }),
  ]);

  enforce(
    evaluateRunAdmission(
      {
        userActive,
        globalActive,
        userRecentSubmits: recent._count._all,
        oldestRecentSubmitMs: recent._min.createdAt?.getTime(),
      },
      {
        maxActivePerUser: limits.maxActivePerUser,
        maxActiveGlobal: limits.maxActiveGlobal,
        maxSubmitsPerWindow: limits.submitPerHour,
        submitWindowMs: HOUR,
      },
      now,
    ),
  );
}
