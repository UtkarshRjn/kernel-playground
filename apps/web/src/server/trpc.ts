import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "./auth";

export interface Context {
  userId: string | null;
}

/** Derive the current user from the Auth.js session (runs on the Node runtime). */
export async function createContext(): Promise<Context> {
  const session = await auth();
  return { userId: session?.user?.id ?? null };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

/** Requires a signed-in user; narrows ctx.userId to string. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in to continue" });
  }
  return next({ ctx: { userId: ctx.userId } });
});
