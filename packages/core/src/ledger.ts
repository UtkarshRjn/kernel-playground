/**
 * Credit ledger with two-phase hold/settle (§8).
 *
 * Every run reserves credits up front (a worst-case hold) before any GPU is touched,
 * then settles against actual usage — capturing what was used and releasing the rest.
 * This is the guardrail that stops a user from spending credits they don't have and
 * stops us from running uncovered compute.
 *
 * This in-memory implementation is the source of truth for the domain logic and its
 * tests. The Prisma-backed implementation (Phase 1 infra) persists the same txn shape.
 */

export type CreditTxnKind = "topup" | "hold" | "capture" | "release";

export interface CreditTxn {
  id: string;
  kind: CreditTxnKind;
  /** Positive = credited to available balance, negative = debited. */
  amount: number;
  holdId?: string;
  at: number;
}

export class InsufficientCreditsError extends Error {
  constructor(
    readonly required: number,
    readonly available: number,
  ) {
    super(`Insufficient credits: need ${required}, have ${available}`);
    this.name = "InsufficientCreditsError";
  }
}

interface Hold {
  id: string;
  amount: number;
  settled: boolean;
}

export class InMemoryCreditLedger {
  private available: number;
  private readonly holds = new Map<string, Hold>();
  private readonly txns: CreditTxn[] = [];
  private seq = 0;

  constructor(initialBalance = 0) {
    if (initialBalance < 0) throw new Error("initialBalance must be >= 0");
    this.available = initialBalance;
    if (initialBalance > 0) this.record("topup", initialBalance);
  }

  /** Credits currently spendable (excludes amounts locked in active holds). */
  get balance(): number {
    return this.available;
  }

  /** Credits locked in unsettled holds. */
  get heldTotal(): number {
    let sum = 0;
    for (const h of this.holds.values()) if (!h.settled) sum += h.amount;
    return sum;
  }

  get history(): readonly CreditTxn[] {
    return this.txns;
  }

  topUp(amount: number): void {
    if (amount <= 0) throw new Error("top-up amount must be > 0");
    this.available += amount;
    this.record("topup", amount);
  }

  /** Reserve `amount` credits. Throws if the available balance can't cover it. */
  placeHold(amount: number): string {
    if (amount < 0) throw new Error("hold amount must be >= 0");
    if (amount > this.available) throw new InsufficientCreditsError(amount, this.available);
    const id = `hold_${++this.seq}`;
    this.available -= amount;
    this.holds.set(id, { id, amount, settled: false });
    this.record("hold", -amount, id);
    return id;
  }

  /**
   * Settle a hold against actual usage: capture `capturedAmount` (which is permanently
   * spent) and release the remainder back to the available balance. `capturedAmount`
   * is clamped to the held amount — holds are sized worst-case, so this should be a
   * no-op clamp in practice, but it keeps the invariant total-conserving.
   */
  settleHold(holdId: string, capturedAmount: number): { captured: number; released: number } {
    const hold = this.holds.get(holdId);
    if (!hold) throw new Error(`unknown hold: ${holdId}`);
    if (hold.settled) throw new Error(`hold already settled: ${holdId}`);
    if (capturedAmount < 0) throw new Error("capturedAmount must be >= 0");

    const captured = Math.min(capturedAmount, hold.amount);
    const released = hold.amount - captured;
    hold.settled = true;

    // The held amount already left `available` at placeHold time; return the unused part.
    this.available += released;
    if (captured > 0) this.record("capture", 0, holdId, captured);
    if (released > 0) this.record("release", released, holdId);
    return { captured, released };
  }

  private record(kind: CreditTxnKind, amount: number, holdId?: string, captureAmount?: number) {
    this.txns.push({
      id: `txn_${this.txns.length + 1}`,
      kind,
      // `capture` records the spent magnitude for auditing without moving `available`
      // (the credits already left the balance at hold time).
      amount: kind === "capture" ? -(captureAmount ?? 0) : amount,
      holdId,
      at: this.txns.length,
    });
  }
}
