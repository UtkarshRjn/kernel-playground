import { randomUUID } from "node:crypto";
import { InsufficientCreditsError, selectExecutionProvider, type KernelSubmission } from "@kp/core";
import {
  BenchmarkConfig,
  GpuType,
  KernelLanguage,
  type ExecutionProvider,
  type RunRequest,
} from "@kp/shared";
import { TRPCError } from "@trpc/server";
import { after } from "next/server";
import { z } from "zod";
import { getOrCreateAccountId, PrismaCreditLedger } from "../credit-ledger";
import { prisma } from "../db";
import { getRunStatus, processRun, submitRun } from "../runs";
import { protectedProcedure, router } from "../trpc";

// Resolved on first request, not at module load: `next build` runs with NODE_ENV=production
// and no EXECUTION_* vars, and selection throws in production when they're missing.
let cachedProvider: ExecutionProvider | undefined;
function getProvider(): ExecutionProvider {
  cachedProvider ??= selectExecutionProvider(process.env);
  return cachedProvider;
}

function internalError(op: string, err: unknown): TRPCError {
  console.error(`[run.${op}]`, err);
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Something went wrong on our side. Please try again.",
  });
}

const fileFor = (language: KernelLanguage, code: string) => ({
  path: language === "cuda" ? "kernel.cu" : "kernel.py",
  content: code,
});

export const runRouter = router({
  /** Current credit balance for the signed-in user. */
  credits: protectedProcedure.query(async ({ ctx }) => {
    const accountId = await getOrCreateAccountId(ctx.userId);
    const ledger = new PrismaCreditLedger(prisma, accountId);
    return { balance: await ledger.getBalance() };
  }),

  /** Free, GPU-free compile/syntax check — the "Test" step (synchronous; it's fast). */
  test: protectedProcedure
    .input(z.object({ language: KernelLanguage, code: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const request: RunRequest = {
        runId: randomUUID(),
        targetId: "test",
        idempotencyKey: randomUUID(),
        language: input.language,
        gpu: "T4",
        files: [fileFor(input.language, input.code)],
        entryPoint: "kp_run",
        compilerFlags: [],
        benchmark: BenchmarkConfig.parse({}),
      };
      try {
        return await getProvider().compileCheck(request);
      } catch (err) {
        throw internalError("test", err);
      }
    }),

  /**
   * Enqueue a benchmark run and return its id immediately. The GPU work runs in the
   * background (via `after`), so the request isn't held open. Poll `run.status`.
   */
  submit: protectedProcedure
    .input(
      z.object({
        language: KernelLanguage,
        code: z.string().min(1),
        gpus: z.array(GpuType).min(1),
        benchmark: BenchmarkConfig.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const accountId = await getOrCreateAccountId(ctx.userId);
      const ledger = new PrismaCreditLedger(prisma, accountId);
      const submission: KernelSubmission = {
        runId: randomUUID(),
        language: input.language,
        files: [fileFor(input.language, input.code)],
        entryPoint: "kp_run",
        gpus: input.gpus,
        benchmark: input.benchmark ?? BenchmarkConfig.parse({}),
      };

      let provider: ExecutionProvider;
      let job: { runId: string; holdId: string };
      try {
        provider = getProvider(); // before placing a hold, so misconfig doesn't strand credits
        job = await submitRun({ userId: ctx.userId, submission, ledger });
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          throw new TRPCError({
            code: "PAYMENT_REQUIRED",
            message: `Not enough credits: need ${err.required}, have ${err.available}`,
          });
        }
        throw internalError("submit", err);
      }

      // Process after the response is flushed — the client polls run.status.
      after(() => processRun({ runId: job.runId, holdId: job.holdId, submission, provider, ledger }));

      return { runId: job.runId, backend: provider.name };
    }),

  /** Poll a run's progress + per-GPU results. */
  status: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ ctx, input }) => {
      const view = await getRunStatus(input.runId, ctx.userId);
      if (!view) throw new TRPCError({ code: "NOT_FOUND", message: "run not found" });
      return view;
    }),
});
