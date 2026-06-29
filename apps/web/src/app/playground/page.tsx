"use client";

import { buildComparison, type Comparison } from "@kp/core";
import { GPU_LIST, type GpuType, type KernelLanguage } from "@kp/shared";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { trpc } from "@/trpc/client";

const STARTER_CUDA = `// Define kp_run() (one iteration) + optional kp_setup()/kp_teardown().
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

const STARTER_TRITON = `# Define kp_run() (one iteration) + optional kp_setup().
import torch
import triton
import triton.language as tl

N = 1 << 22

@triton.jit
def add_kernel(x_ptr, y_ptr, out_ptr, n, BLOCK: tl.constexpr):
    pid = tl.program_id(0)
    offs = pid * BLOCK + tl.arange(0, BLOCK)
    mask = offs < n
    x = tl.load(x_ptr + offs, mask=mask)
    y = tl.load(y_ptr + offs, mask=mask)
    tl.store(out_ptr + offs, x + y, mask=mask)

def kp_setup():
    global x, y, out
    x = torch.randn(N, device="cuda")
    y = torch.randn(N, device="cuda")
    out = torch.empty(N, device="cuda")

def kp_run():
    add_kernel[(triton.cdiv(N, 1024),)](x, y, out, N, BLOCK=1024)
`;

const STARTERS: Record<KernelLanguage, string> = { cuda: STARTER_CUDA, triton: STARTER_TRITON };
const DEFAULT_GPUS: GpuType[] = ["T4", "A100_80GB", "H100"];

function fmt(n: number | null, digits = 4): string {
  return n === null ? "—" : n.toFixed(digits);
}

export default function Playground() {
  const [language, setLanguage] = useState<KernelLanguage>("cuda");
  const [code, setCode] = useState(STARTER_CUDA);
  const [selected, setSelected] = useState<Set<GpuType>>(new Set(DEFAULT_GPUS));
  const [running, setRunning] = useState(false);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    trpc.run.credits
      .query()
      .then((c) => setCredits(c.balance))
      .catch(() => {});
  }, []);

  function switchLanguage(lang: KernelLanguage) {
    setLanguage(lang);
    setCode(STARTERS[lang]);
    setComparison(null);
  }

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
        language,
        files: [{ path: language === "cuda" ? "kernel.cu" : "kernel.py", content: code }],
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

  // Bar width is proportional to speed (fastest = 100%).
  const fastestMedian = comparison
    ? Math.min(
        ...comparison.rows
          .map((r) => r.medianMs)
          .filter((m): m is number => m !== null),
        Infinity,
      )
    : Infinity;

  return (
    <>
      <Header right={<span className="chip">{credits === null ? "…" : `${credits} credits`}</span>} />

      <main className="container pg-wrap">
        <div className="pg-top">
          <div>
            <h1>Playground</h1>
            <p>Write a kernel, pick your GPUs, and compare on real hardware.</p>
          </div>
        </div>

        <div className="pg-layout">
          <div className="editor-panel">
            <div className="editor-bar">
              <div className="seg">
                {(["cuda", "triton"] as const).map((lang) => (
                  <button
                    key={lang}
                    className={language === lang ? "active" : ""}
                    onClick={() => switchLanguage(lang)}
                  >
                    {lang === "cuda" ? "CUDA" : "Triton"}
                  </button>
                ))}
              </div>
              <span className="fname">{language === "cuda" ? "kernel.cu" : "kernel.py"}</span>
            </div>
            <textarea
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>

          <div className="side">
            <div className="panel">
              <div className="label">Target GPUs</div>
              <div className="gpu-grid">
                {GPU_LIST.map((spec) => {
                  const on = selected.has(spec.type);
                  return (
                    <div
                      key={spec.type}
                      className={`gpu${on ? " on" : ""}`}
                      onClick={() => toggle(spec.type)}
                    >
                      <span className="tick">{on ? "✓" : ""}</span>
                      <span className="name">{spec.label}</span>
                      <span className="price">${(spec.pricePerSec * 3600).toFixed(2)}/hr</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="run-row">
              <button
                className="btn btn-primary"
                disabled={running || selected.size === 0}
                onClick={run}
              >
                {running ? (
                  <>
                    <span className="spinner" /> Running…
                  </>
                ) : (
                  `Run on ${selected.size} GPU${selected.size === 1 ? "" : "s"}`
                )}
              </button>
            </div>

            {error && <div className="error-box">{error}</div>}
          </div>
        </div>

        <section className="results">
          {!comparison && !error && (
            <div className="empty">
              Pick your GPUs and hit run — results, speedup bars and perf-per-dollar appear here.
            </div>
          )}

          {comparison && (
            <>
              <div className="winners">
                <div className="winner fast">
                  <div className="k">⚡ Fastest</div>
                  <div className="v">{comparison.fastestGpu ?? "—"}</div>
                </div>
                <div className="winner value">
                  <div className="k">💰 Best value</div>
                  <div className="v">{comparison.bestValueGpu ?? "—"}</div>
                </div>
              </div>

              <div className="bars">
                {comparison.rows.map((r) => {
                  const width =
                    r.medianMs !== null && fastestMedian !== Infinity
                      ? (fastestMedian / r.medianMs) * 100
                      : 0;
                  return (
                    <div className="barrow" key={r.gpu}>
                      <span className="glabel">
                        {r.gpu}
                        {r.gpu === comparison.fastestGpu && " ⚡"}
                        {r.gpu === comparison.bestValueGpu && " 💰"}
                      </span>
                      <div className="bartrack">
                        <div
                          className={`barfill${r.medianMs === null ? " failed" : ""}`}
                          style={{ width: `${r.medianMs === null ? 100 : width}%` }}
                        />
                      </div>
                      <span className="btime">
                        {r.medianMs === null ? r.status : `${fmt(r.medianMs)} ms`}
                      </span>
                    </div>
                  );
                })}
              </div>

              <table className="rtable">
                <thead>
                  <tr>
                    <th>GPU</th>
                    <th>Median (ms)</th>
                    <th>Speedup</th>
                    <th>Cost (USD)</th>
                    <th>Perf / $</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((r) => (
                    <tr key={r.gpu}>
                      <td>{r.gpu}</td>
                      <td>{fmt(r.medianMs)}</td>
                      <td>{r.speedupVsSlowest === null ? "—" : `${r.speedupVsSlowest.toFixed(2)}×`}</td>
                      <td>{r.costUsd.toFixed(5)}</td>
                      <td>{r.speedPerDollar === null ? "—" : Math.round(r.speedPerDollar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      </main>
    </>
  );
}
