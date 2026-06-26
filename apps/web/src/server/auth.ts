import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

/**
 * Auth.js (NextAuth v5) configuration. GitHub provider per the chosen stack.
 *
 * Reads AUTH_GITHUB_ID / AUTH_GITHUB_SECRET / AUTH_SECRET from the environment at
 * runtime. TODO(infra): add the Prisma adapter so sessions/users persist, then have
 * the tRPC context derive userId from `auth()` instead of the dev stub.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
});
