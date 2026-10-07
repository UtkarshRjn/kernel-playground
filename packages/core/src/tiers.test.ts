import { describe, expect, it } from "vitest";
import { GPU_LIST } from "@kp/shared";
import { ALL_TIERS, allowedTiersFor, disallowedGpus, parseAllowlist } from "./tiers.js";

describe("tiers", () => {
  it("parses ids and emails, lowercasing emails and ignoring blanks", () => {
    const list = parseAllowlist(" usr_ABC, Owner@Example.com\n other ,,");
    expect([...list].sort()).toEqual(["other", "owner@example.com", "usr_ABC"]);
    expect(parseAllowlist(undefined).size).toBe(0);
    expect(parseAllowlist("").size).toBe(0);
  });

  it("grants only the free tier by default", () => {
    expect(allowedTiersFor({ id: "u1", email: "a@b.com" }, new Set())).toEqual(["free"]);
  });

  it("grants all tiers to allowlisted ids or emails (case-insensitive)", () => {
    const list = parseAllowlist("u1,owner@example.com");
    expect(allowedTiersFor({ id: "u1" }, list)).toEqual([...ALL_TIERS]);
    expect(allowedTiersFor({ id: "u2", email: "OWNER@example.com" }, list)).toEqual([...ALL_TIERS]);
    expect(allowedTiersFor({ id: "u3", email: null }, list)).toEqual(["free"]);
  });

  it("does not match ids case-insensitively", () => {
    expect(allowedTiersFor({ id: "U1" }, parseAllowlist("u1"))).toEqual(["free"]);
  });

  it("flags GPUs outside the allowed tiers", () => {
    expect(disallowedGpus(["T4", "L4"], ["free"])).toEqual([]);
    expect(disallowedGpus(["T4", "B200", "A10", "B200"], ["free"])).toEqual(["B200", "A10"]);
    expect(disallowedGpus(["H100"], ["free", "standard"])).toEqual(["H100"]);
  });

  it("allows every catalog GPU with all tiers", () => {
    expect(disallowedGpus(GPU_LIST.map((g) => g.type), ALL_TIERS)).toEqual([]);
  });
});
