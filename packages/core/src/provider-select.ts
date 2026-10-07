import type { ExecutionProvider } from "@kp/shared";
import { HttpModalProvider } from "./http-provider.js";
import { MockExecutionProvider } from "./mock-provider.js";

export type ProviderEnv = Record<string, string | undefined>;

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

export function isProductionEnv(env: ProviderEnv): boolean {
  return env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
}

/**
 * Pick the execution backend from env. Real GPUs when EXECUTION_API_URL + EXECUTION_TOKEN
 * are set; otherwise the mock, but only in development or when KP_ALLOW_MOCK_PROVIDER=1.
 * In production, missing config throws rather than silently serving fake benchmarks.
 *
 * Call lazily (per request), never at module load: `next build` runs with
 * NODE_ENV=production and no EXECUTION_* vars.
 */
export function selectExecutionProvider(env: ProviderEnv): ExecutionProvider {
  const url = env.EXECUTION_API_URL;
  const token = env.EXECUTION_TOKEN;
  if (url && token) return new HttpModalProvider(url, token);
  if (env.KP_ALLOW_MOCK_PROVIDER === "1" || !isProductionEnv(env)) {
    return new MockExecutionProvider();
  }
  const missing = [!url && "EXECUTION_API_URL", !token && "EXECUTION_TOKEN"].filter(Boolean);
  throw new ProviderConfigError(
    `Execution backend not configured: missing ${missing.join(", ")}. ` +
      "Set them, or set KP_ALLOW_MOCK_PROVIDER=1 to explicitly use the mock backend.",
  );
}
