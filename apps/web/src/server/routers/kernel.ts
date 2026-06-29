import { KernelLanguage } from "@kp/shared";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";

const fileInput = z.object({ path: z.string().min(1), content: z.string() });

export const kernelRouter = router({
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        language: KernelLanguage,
        files: z.array(fileInput).min(1),
        entryPoint: z.string().min(1),
      }),
    )
    .mutation(({ ctx, input }) => {
      const id = ctx.store.nextId("kernel");
      ctx.store.kernels.set(id, {
        id,
        workspaceId: `${ctx.userId}-default`,
        name: input.name,
        language: input.language,
        files: input.files,
        entryPoint: input.entryPoint,
        createdAt: Date.now(),
      });
      return { id };
    }),

  list: publicProcedure.query(({ ctx }) => {
    return [...ctx.store.kernels.values()].map((k) => ({
      id: k.id,
      name: k.name,
      language: k.language,
      createdAt: k.createdAt,
    }));
  }),

  get: publicProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    const kernel = ctx.store.kernels.get(input.id);
    if (!kernel) throw new Error(`kernel not found: ${input.id}`);
    return kernel;
  }),
});
