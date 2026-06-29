"use client";

import { buildComparison, type Comparison } from "@kp/core";
import { GPU_LIST, type GpuType } from "@kp/shared";
import { useEffect, useState } from "react";
import { trpc } from "@/trpc/client";

const STARTER = `// Define kp_run() (one iteration) + optional kp_setup()/kp_teardown().
#include <cuda_runtime.h>
#define N (1 << 22)
static float *dA, *dB, *dC;

__global__ void vadd(const float* a, const float* b, float* c, int n) {
  int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i < n) c[i] = a[i] + b[i];
}

extern "C" void kp_setup() {
  cudaMalloc(&dA, N*sizeof(float));
  cudaMalloc(&dB, N*sizeof(float));
  cudaMalloc(&dC, N*sizeof(float));
}
extern "C" void kp_run() {
  int t = 256, b = (N + t - 1) / t;
  vadd<<<b, t>>>(dA, dB, dC, N);
}
extern "C" void kp_teardown() { cudaFree(dA); cudaFree(dB); cudaFree(dC); }
`;

const DEFAULT_GPUS: GpuType[] = ["T4", "A100_80GB", "H100"];

function fmt(n: number | null, digits = 4): string {
  return n === null ? "—" : n.toFixed(digits);
}

export default function Playground() {
  const [code, setCode] = useState(STARTER);
  const [selected, setSelected] = useState<Set<GpuType>>(new Set(DEFAULT_GPUS));
  const [running, setRunning] = useState(false);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    trpc.run.credits.query().then((c) => setCredits(c.balance)).catch(() => {});
  }, []);

  function toggle(gpu: GpuType) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(gpu)) next.delete(gpu);
      else next.add(gpu);
      return next;
    });
  }

  async function run() {
    setRunning(true);
    setError(null);
    setComparison(null);
    try {
      const { id } = await trpc.kernel.create.mutate({
        name: "playground kernel",
        language: "cuda",
        files: [{ path: "kernel.cu", content: code }],
        entryPoint: "kp_run",
      });
      const report = await trpc.run.submit.mutate({ kernelId: id, gpus: [...selected] });
      setComparison(buildComparison(report.targets));
      const c = await trpc.run.credits.query();
      setCredits(c.balance);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="container">
      <header className="pg-head">
        <h1 className="pg-title">Playground</h1>
        <span className="pg-credits">
          credits: {credits === null ? "…" : credits}
        </span>
      </header>

      <textarea
        className="pg-editor"
        spellCheck={false}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />

      <div className="pg-gpus">
        {GPU_LIST.map((spec) => (
          <label key={spec.type} className="pg-gpu">
            <input
              type="checkbox"
              checked={selected.has(spec.type)}
              onChange={() => toggle(spec.type)}
            />
            <span>{spec.label}</span>
            <span className="pg-price">${(spec.pricePerSec * 3600).toFixed(2)}/hr</span>
          </label>
        ))}
      </div>

      <button className="pg-run" disabled={running || selected.size === 0} onClick={run}>
        {running ? "Running…" : `Run on ${selected.size} GPU${selected.size === 1 ? "" : "s"}`}
      </button>

      {error && <p className="pg-error">{error}</p>}

      {comparison && (
        <table className="pg-table">
          <thead>
            <tr>
              <th>GPU</th>
              <th>Status</th>
              <th>Median (ms)</th>
              <th>Speedup</th>
              <th>Cost (USD)</th>
              <th>Perf / $</th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((r) => (
              <tr key={r.gpu}>
                <td>
                  {r.gpu}
                  {r.gpu === comparison.fastestGpu && <span title="fastest"> ⚡</span>}
                  {r.gpu === comparison.bestValueGpu && <span title="best value"> 💰</span>}
                </td>
                <td>{r.status}</td>
                <td>{fmt(r.medianMs)}</td>
                <td>{r.speedupVsSlowest === null ? "—" : `${r.speedupVsSlowest.toFixed(2)}×`}</td>
                <td>{r.costUsd.toFixed(5)}</td>
                <td>{fmt(r.speedPerDollar, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {comparison && (
        <p className="pg-summary">
          ⚡ Fastest: <b>{comparison.fastestGpu ?? "—"}</b> · 💰 Best value:{" "}
          <b>{comparison.bestValueGpu ?? "—"}</b>
        </p>
      )}
    </main>
  );
}
