import { describe, expect, it } from "vitest";
import { InMemoryCreditLedger, InsufficientCreditsError } from "./ledger.js";

describe("InMemoryCreditLedger", () => {
  it("starts with the initial balance and records a top-up", () => {
    const l = new InMemoryCreditLedger(100);
    expect(l.balance).toBe(100);
    expect(l.history.at(0)?.kind).toBe("topup");
  });

  it("locks credits on hold and excludes them from balance", async () => {
    const l = new InMemoryCreditLedger(100);
    await l.placeHold(30);
    expect(l.balance).toBe(70);
    expect(l.heldTotal).toBe(30);
  });

  it("rejects a hold larger than the available balance", async () => {
    const l = new InMemoryCreditLedger(20);
    await expect(l.placeHold(50)).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(l.balance).toBe(20); // unchanged
  });

  it("captures actual usage and releases the remainder", async () => {
    const l = new InMemoryCreditLedger(100);
    const hold = await l.placeHold(40);
    const { captured, released } = await l.settleHold(hold, 15);
    expect(captured).toBe(15);
    expect(released).toBe(25);
    expect(l.balance).toBe(100 - 15); // only captured credits are spent
    expect(l.heldTotal).toBe(0);
  });

  it("clamps capture to the held amount (conserves total)", async () => {
    const l = new InMemoryCreditLedger(50);
    const hold = await l.placeHold(10);
    const { captured, released } = await l.settleHold(hold, 999);
    expect(captured).toBe(10);
    expect(released).toBe(0);
    expect(l.balance).toBe(40);
  });

  it("refuses to settle a hold twice", async () => {
    const l = new InMemoryCreditLedger(50);
    const hold = await l.placeHold(10);
    await l.settleHold(hold, 5);
    await expect(l.settleHold(hold, 5)).rejects.toThrow();
  });

  it("conserves credits across hold/settle cycles", async () => {
    const l = new InMemoryCreditLedger(100);
    const h1 = await l.placeHold(20);
    await l.settleHold(h1, 7);
    const h2 = await l.placeHold(50);
    await l.settleHold(h2, 50);
    // spent 7 + 50 = 57
    expect(l.balance).toBe(43);
    expect(l.heldTotal).toBe(0);
  });
});
