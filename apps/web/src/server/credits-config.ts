import { starterCreditConfigFromEnv } from "@kp/core";

/** Starter grant policy (§8 free tier); env: KP_STARTER_CREDITS, KP_MIN_GITHUB_ACCOUNT_AGE_DAYS. */
export const STARTER_CREDIT_CONFIG = starterCreditConfigFromEnv(process.env);
