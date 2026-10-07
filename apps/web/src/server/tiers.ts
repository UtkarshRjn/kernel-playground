import { allowedTiersFor, parseAllowlist, type GpuTier } from "@kp/core";
import { prisma } from "./db";

/** GPU tiers the user may run on. `KP_PREMIUM_USER_IDS` (ids or emails) grants all tiers. */
export async function getAllowedTiers(userId: string): Promise<GpuTier[]> {
  const allowlist = parseAllowlist(process.env.KP_PREMIUM_USER_IDS);
  if (allowlist.size === 0) return allowedTiersFor({ id: userId }, allowlist);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return allowedTiersFor({ id: userId, email: user?.email }, allowlist);
}
