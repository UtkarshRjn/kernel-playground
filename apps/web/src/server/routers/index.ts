import { createCallerFactory, router } from "../trpc";
import { kernelRouter } from "./kernel";
import { runRouter } from "./run";

export const appRouter = router({
  kernel: kernelRouter,
  run: runRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
