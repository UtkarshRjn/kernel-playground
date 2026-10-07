import { GPU_CATALOG, type GpuSpec, type GpuType } from "@kp/shared";

export type GpuTier = GpuSpec["tier"];

export const ALL_TIERS: readonly GpuTier[] = ["free", "standard", "premium"];

/** Parse a comma/whitespace-separated allowlist of user ids or emails (emails lowercased). */
export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s.includes("@") ? s.toLowerCase() : s)),
  );
}

/**
 * Tiers a user may run on. There is no paid plan yet, so everyone gets "free";
 * users on the allowlist (by id or email) get every tier.
 */
export function allowedTiersFor(
  user: { id: string; email?: string | null },
  allowlist: ReadonlySet<string>,
): GpuTier[] {
  const email = user.email?.toLowerCase();
  if (allowlist.has(user.id) || (email && allowlist.has(email))) return [...ALL_TIERS];
  return ["free"];
}

/** GPUs from `gpus` whose tier is not in `allowed` (deduplicated, input order). */
export function disallowedGpus(gpus: readonly GpuType[], allowed: readonly GpuTier[]): GpuType[] {
  return [...new Set(gpus)].filter((g) => !allowed.includes(GPU_CATALOG[g].tier));
}
