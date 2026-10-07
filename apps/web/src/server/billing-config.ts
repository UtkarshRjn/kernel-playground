import { type BillingConfig, DEFAULT_BILLING_CONFIG } from "@kp/core";

/** Read a numeric env override; fall back to the default when unset or out of range. */
function envNumber(name: string, fallback: number, isValid: (n: number) => boolean): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !isValid(n)) {
    console.warn(`[billing] ignoring invalid ${name}=${raw}; using ${fallback}`);
    return fallback;
  }
  return n;
}

/** Credit pricing knobs, overridable per deployment. Multiplier < 1 would sell below cost. */
export const billingConfig: BillingConfig = {
  ...DEFAULT_BILLING_CONFIG,
  startupOverheadSec: envNumber(
    "KP_BILLING_STARTUP_OVERHEAD_SEC",
    DEFAULT_BILLING_CONFIG.startupOverheadSec,
    (n) => n >= 0,
  ),
  priceMultiplier: envNumber(
    "KP_BILLING_PRICE_MULTIPLIER",
    DEFAULT_BILLING_CONFIG.priceMultiplier,
    (n) => n >= 1,
  ),
  minCreditsPerTarget: envNumber(
    "KP_BILLING_MIN_CREDITS_PER_TARGET",
    DEFAULT_BILLING_CONFIG.minCreditsPerTarget,
    (n) => Number.isInteger(n) && n >= 0,
  ),
};
