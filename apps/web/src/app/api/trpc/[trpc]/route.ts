import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "@/server/trpc";
import { appRouter } from "@/server/routers";

// run.submit does the GPU work in `after()`, which shares this invocation's time budget.
// 800s is the Vercel Pro + Fluid compute ceiling. Keep below RUN_STALE_AFTER_SEC's
// minimum (MIN_STALE_RUN_THRESHOLD_SEC in @kp/core) so the sweeper never fails a live run.
export const maxDuration = 800;

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
  });
}

export { handler as GET, handler as POST };
