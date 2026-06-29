import { initTRPC } from "@trpc/server";
import { store, type InMemoryStore } from "./store";

export interface Context {
  store: InMemoryStore;
  /** Current user id. TODO(infra): derive from the Auth.js session instead of a dev stub. */
  userId: string;
}

export function createContext(): Context {
  return { store, userId: "dev-user" };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
