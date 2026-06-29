import {
  HttpModalProvider,
  InsufficientCreditsError,
  MockExecutionProvider,
  orchestrateRun,
  type KernelSubmission,
} from "@kp/core";
import { BenchmarkConfig, GpuType, type ExecutionProvider, type RunRequest } from "@kp/shared";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";

// Real GPUs when the Modal endpoint is configured; deterministic mock otherwise.
function makeProvider(): ExecutionProvider {
  const url = process.env.EXECUTION_API_URL;
  const token = process.env.EXECUTION_TOKEN;
  if (url && token) return new HttpModalProvider(url, token);
  return new MockExecutionProvider();
}

const provider = makeProvider();

export const runRouter = router({
  /** Submit a kernel to run on one or more GPUs (single-GPU run or §3 compare). */
  submit: publicProcedure
    .input(
      z.object({
        kernelId: z.string(),
        gpus: z.array(GpuType).min(1),
        benchmark: BenchmarkConfig.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const kernel = ctx.store.kernels.get(input.kernelId);
      if (!kernel) throw new TRPCError({ code: "NOT_FOUND", message: "kernel not found" });

      const runId = ctx.store.nextId("run");
      const submission: KernelSubmission = {
        runId,
        language: kernel.language,
        files: kernel.files,
        entryPoint: kernel.entryPoint,
        gpus: input.gpus,
        benchmark: input.benchmark ?? BenchmarkConfig.parse({}),
      };

      const ledger = ctx.store.ledgerFor(ctx.userId);
      let report;
      try {
        report = await orchestrateRun(submission, provider, ledger);
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          throw new TRPCError({
            code: "PAYMENT_REQUIRED",
            message: `Not enough credits: need ${err.required}, have ${err.available}`,
          });
        }
        throw err;
      }

      ctx.store.runs.set(runId, {
        id: runId,
        kernelId: kernel.id,
        userId: ctx.userId,
        type: input.gpus.length > 1 ? "compare" : "single",
        status: "succeeded",
        targets: report.targets.map((t) => ({
          gpu: t.gpu,
          status: t.status,
          gpuSeconds: t.gpuSeconds,
        })),
        createdAt: Date.now(),
      });

      return report;
    }),

  /** Free, GPU-free compile/syntax check — the cheap "Test" before submitting. */
  test: publicProcedure
    .input(z.object({ kernelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const kernel = ctx.store.kernels.get(input.kernelId);
      if (!kernel) throw new TRPCError({ code: "NOT_FOUND", message: "kernel not found" });
      const request: RunRequest = {
        runId: ctx.store.nextId("test"),
        targetId: "test",
        idempotencyKey: `test:${kernel.id}`,
        language: kernel.language,
        gpu: "T4", // placeholder; the compile check never touches a real device
        files: kernel.files,
        entryPoint: kernel.entryPoint,
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

  get: publicProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    const run = ctx.store.runs.get(input.id);
    if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "run not found" });
    return run;
  }),

  /** Current credit balance for the user (§8). */
  credits: publicProcedure.query(({ ctx }) => {
    const ledger = ctx.store.ledgerFor(ctx.userId);
    return { balance: ledger.balance, held: ledger.heldTotal };
  }),
});
