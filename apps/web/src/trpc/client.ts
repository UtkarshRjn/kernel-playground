import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@/server/routers";

/** Vanilla tRPC client for use in client components. */
export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/api/trpc" })],
});
