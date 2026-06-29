import { InMemoryCreditLedger } from "@kp/core";
import type { KernelFile, KernelLanguage } from "@kp/shared";

/**
 * In-memory data store backing the Phase 1 API.
 *
 * Lets the full run pipeline (kernels → runs → credit hold/settle) work end to end with
 * no external infra, so the API and its tests run anywhere. The persistence model it
 * stands in for is prisma/schema.prisma.
 *
 * TODO(infra): replace with a Prisma-backed repository implementing the same surface.
 */

export interface StoredKernel {
  id: string;
  workspaceId: string;
  name: string;
  language: KernelLanguage;
  files: KernelFile[];
  entryPoint: string;
  createdAt: number;
}

export interface StoredRunTarget {
  gpu: string;
  status: string;
  gpuSeconds: number;
}

export interface StoredRun {
  id: string;
  kernelId: string;
  userId: string;
  type: "single" | "compare";
  status: string;
  targets: StoredRunTarget[];
  createdAt: number;
}

/** A single process-wide store instance for dev. */
export class InMemoryStore {
  private seq = 0;
  readonly kernels = new Map<string, StoredKernel>();
  readonly runs = new Map<string, StoredRun>();
  private readonly ledgers = new Map<string, InMemoryCreditLedger>();

  nextId(prefix: string): string {
    return `${prefix}_${++this.seq}`;
  }

  /** Get (or lazily create) a user's credit ledger. New users get a starter grant. */
  ledgerFor(userId: string): InMemoryCreditLedger {
    let ledger = this.ledgers.get(userId);
    if (!ledger) {
      ledger = new InMemoryCreditLedger(1000); // free starter credits (§8 free tier)
      this.ledgers.set(userId, ledger);
    }
    return ledger;
  }
}

/** Shared singleton, reused across hot reloads in dev. */
const globalForStore = globalThis as unknown as { __kpStore?: InMemoryStore };
export const store: InMemoryStore = globalForStore.__kpStore ?? new InMemoryStore();
globalForStore.__kpStore = store;
