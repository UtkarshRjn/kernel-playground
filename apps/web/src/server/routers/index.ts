import { createCallerFactory, router } from "../trpc";
import { runRouter } from "./run";

export const appRouter = router({
  run: runRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
