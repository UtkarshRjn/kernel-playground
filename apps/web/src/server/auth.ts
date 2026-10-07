import { PrismaAdapter } from "@auth/prisma-adapter";
import { decideStarterCredits } from "@kp/core";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { ensureCreditAccount } from "./credit-ledger";
import { STARTER_CREDIT_CONFIG } from "./credits-config";
import { prisma } from "./db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [GitHub, Google],
  session: { strategy: "database" },
  pages: { signIn: "/signin" },
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
  events: {
    // Give new users a starter credit balance if their OAuth profile passes the
    // anti-farming checks. No-op once the user has a credit account.
    async signIn({ user, account, profile }) {
      if (!user.id || !account) return;
      const decision = decideStarterCredits(account.provider, profile, STARTER_CREDIT_CONFIG);
      try {
        await ensureCreditAccount(user.id, decision.credits);
      } catch (err) {
        // Never fail sign-in over credits; the run router lazily creates a 0-credit account.
        console.error("starter credit grant failed", { userId: user.id, err });
      }
    },
  },
});
