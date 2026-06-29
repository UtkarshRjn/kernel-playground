import { describe, expect, it } from "vitest";
import { createContext } from "../trpc";
import { createCaller } from "./index";

function newCaller() {
  return createCaller(createContext());
}

describe("run pipeline (via tRPC caller)", () => {
  it("creates a kernel and runs it across multiple GPUs, charging credits", async () => {
    const caller = newCaller();
    const { id: kernelId } = await caller.kernel.create({
      name: "vector add",
      language: "cuda",
      files: [{ path: "kernel.cu", content: "__global__ void add() {}" }],
      entryPoint: "main",
    });

    const before = await caller.run.credits();
    const report = await caller.run.submit({
      kernelId,
      gpus: ["T4", "A100_80GB", "H100"],
    });

    expect(report.targets).toHaveLength(3);
    expect(report.creditsCharged).toBeGreaterThan(0);

    const after = await caller.run.credits();
    expect(after.balance).toBe(before.balance - report.creditsCharged);
    expect(after.held).toBe(0); // hold fully settled

    const stored = await caller.run.get({ id: report.runId });
    expect(stored.type).toBe("compare");
  });

  it("rejects an unknown kernel", async () => {
    const caller = newCaller();
    await expect(caller.run.submit({ kernelId: "nope", gpus: ["T4"] })).rejects.toThrow();
  });
});
