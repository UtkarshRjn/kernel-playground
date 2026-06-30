import { randomUUID } from "node:crypto";
import { type CreditLedger, InsufficientCreditsError } from "@kp/core";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { STARTER_CREDITS } from "./credits-config";

/** Postgres-backed credit ledger (hold/settle in transactions). */
export class PrismaCreditLedger implements CreditLedger {
  constructor(
    private readonly db: PrismaClient,
    private readonly accountId: string,
  ) {}

  async getBalance(): Promise<number> {
    const account = await this.db.creditAccount.findUniqueOrThrow({
      where: { id: this.accountId },
    });
    return account.balance;
  }

  async placeHold(amount: number): Promise<string> {
    return this.db.$transaction(async (tx) => {
      const account = await tx.creditAccount.findUniqueOrThrow({ where: { id: this.accountId } });
      if (amount > account.balance) throw new InsufficientCreditsError(amount, account.balance);
      const holdId = randomUUID();
      await tx.creditAccount.update({
        where: { id: this.accountId },
        data: { balance: { decrement: amount } },
      });
      await tx.creditTxn.create({
        data: { accountId: this.accountId, kind: "hold", amount: -amount, holdId },
      });
      return holdId;
    });
  }

  async settleHold(
    holdId: string,
    capturedAmount: number,
  ): Promise<{ captured: number; released: number }> {
    return this.db.$transaction(async (tx) => {
      const hold = await tx.creditTxn.findFirst({
        where: { accountId: this.accountId, kind: "hold", holdId },
      });
      if (!hold) throw new Error(`unknown hold: ${holdId}`);
      const alreadySettled = await tx.creditTxn.findFirst({
        where: { accountId: this.accountId, holdId, kind: { in: ["capture", "release"] } },
      });
      if (alreadySettled) throw new Error(`hold already settled: ${holdId}`);

      const held = -hold.amount;
      const captured = Math.min(Math.max(capturedAmount, 0), held);
      const released = held - captured;
      if (released > 0) {
        await tx.creditAccount.update({
          where: { id: this.accountId },
          data: { balance: { increment: released } },
        });
      }
      await tx.creditTxn.create({
        data: { accountId: this.accountId, kind: "capture", amount: -captured, holdId },
      });
      if (released > 0) {
        await tx.creditTxn.create({
          data: { accountId: this.accountId, kind: "release", amount: released, holdId },
        });
      }
      return { captured, released };
    });
  }
}

/** Get (or lazily create) the user's credit account id. */
export async function getOrCreateAccountId(userId: string): Promise<string> {
  const existing = await prisma.creditAccount.findUnique({ where: { userId } });
  if (existing) return existing.id;
  const created = await prisma.creditAccount.create({
    data: {
      userId,
      balance: STARTER_CREDITS,
      txns: { create: { kind: "grant", amount: STARTER_CREDITS } },
    },
  });
  return created.id;
}
