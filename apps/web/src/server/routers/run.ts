import { randomUUID } from "node:crypto";
import {
  HttpModalProvider,
  InsufficientCreditsError,
  MockExecutionProvider,
  type KernelSubmission,
} from "@kp/core";
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

// Real GPUs when the Modal endpoint is configured; deterministic mock otherwise.
function makeProvider(): ExecutionProvider {
  const url = process.env.EXECUTION_API_URL;
  const token = process.env.EXECUTION_TOKEN;
  if (url && token) return new HttpModalProvider(url, token);
  return new MockExecutionProvider();
}
const provider = makeProvider();

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
        return await provider.compileCheck(request);
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : String(err),
        });
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

      let job: { runId: string; holdId: string };
      try {
        job = await submitRun({ userId: ctx.userId, submission, ledger });
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          throw new TRPCError({
            code: "PAYMENT_REQUIRED",
            message: `Not enough credits: need ${err.required}, have ${err.available}`,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : String(err),
        });
      }

      // Process after the response is flushed — the client polls run.status.
      after(() => processRun({ runId: job.runId, holdId: job.holdId, submission, provider, ledger }));

      return { runId: job.runId };
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
