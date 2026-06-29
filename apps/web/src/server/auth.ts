import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { prisma } from "./db";

/** Credits granted to each new account (§8 free tier). */
export const STARTER_CREDITS = 1000;

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
    // Give every new user a starter credit balance.
    async createUser({ user }) {
      if (!user.id) return;
      await prisma.creditAccount.create({
        data: {
          userId: user.id,
          balance: STARTER_CREDITS,
          txns: { create: { kind: "grant", amount: STARTER_CREDITS } },
        },
      });
    },
  },
});
