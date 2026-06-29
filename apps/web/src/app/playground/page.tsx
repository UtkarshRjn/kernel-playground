"use client";

import { buildComparison, type Comparison } from "@kp/core";
import { type GpuType, type KernelLanguage } from "@kp/shared";
import { motion } from "framer-motion";
import { Copy, FileCode2, Inbox, RotateCcw, Zap } from "lucide-react";
import { DollarSign } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CountUp } from "@/components/CountUp";
import { GpuSelector } from "@/components/GpuSelector";
import { Header } from "@/components/Header";
import { trpc } from "@/trpc/client";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), {
  ssr: false,
  loading: () => <div className="editor-loading">Loading editor…</div>,
});

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
      const ok = report.targets.filter((t) => t.status === "succeeded").length;
      toast.success(`Ran on ${ok} GPU${ok === 1 ? "" : "s"} · ${report.creditsCharged} credits`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setCode(STARTERS[language]);
    toast.success("Reset to starter kernel");
  }
  async function copy() {
    await navigator.clipboard.writeText(code);
    toast.success("Copied to clipboard");
  }

  const lines = code.split("\n").length;
  const fastestMedian = comparison
    ? Math.min(
        ...comparison.rows.map((r) => r.medianMs).filter((m): m is number => m !== null),
        Infinity,
      )
    : Infinity;
  const fastestRow = comparison?.rows.find((r) => r.gpu === comparison.fastestGpu);
  const valueRow = comparison?.rows.find((r) => r.gpu === comparison.bestValueGpu);

  return (
    <>
      <Header
        right={<span className="chip">{credits === null ? "…" : `${credits} credits`}</span>}
      />

      <main className="container pg-wrap">
        <div className="pg-top">
          <h1>Playground</h1>
          <p>Write a kernel, pick your GPUs, and compare on real hardware.</p>
        </div>

        <div className="pg-layout">
          <div className="editor-panel">
            <div className="editor-tabs">
              <div style={{ display: "flex", gap: 6 }}>
                {(["cuda", "triton"] as const).map((lang) => (
                  <button
                    key={lang}
                    className={`tab${language === lang ? " active" : ""}`}
                    onClick={() => switchLanguage(lang)}
                  >
                    <FileCode2 size={14} />
                    kernel<span className="fext">.{lang === "cuda" ? "cu" : "py"}</span>
                  </button>
                ))}
              </div>
              <div className="editor-tools">
                <button className="icon-btn" title="Copy" onClick={copy}>
                  <Copy size={15} />
                </button>
                <button className="icon-btn" title="Reset to starter" onClick={reset}>
                  <RotateCcw size={15} />
                </button>
              </div>
            </div>
            <CodeEditor value={code} language={language} onChange={setCode} />
            <div className="editor-status">
              <span>{language === "cuda" ? "CUDA C++" : "Triton · Python"}</span>
              <span>{lines} lines</span>
              <span className={running ? "" : "ok"} style={{ marginLeft: "auto" }}>
                {running ? "Running…" : "● Ready"}
              </span>
            </div>
          </div>

          <div className="side">
            <GpuSelector
              selected={selected}
              onToggle={toggle}
              onPreset={(gpus) => setSelected(new Set(gpus))}
            />
            <button
              className="btn btn-primary btn-lg run-btn"
              disabled={running || selected.size === 0}
              onClick={run}
            >
              {running ? (
                <>
                  <span className="spinner" /> Running…
                </>
              ) : (
                <>
                  <Zap size={16} /> Run on {selected.size} GPU{selected.size === 1 ? "" : "s"}
                </>
              )}
            </button>
          </div>
        </div>

        <section className="results">
          {running && (
            <div className="bars">
              {[...selected].map((g) => (
                <div className="barrow" key={g}>
                  <span className="glabel">{g}</span>
                  <div className="skrow" />
                  <span className="btime">…</span>
                </div>
              ))}
            </div>
          )}

          {!running && !comparison && (
            <div className="empty">
              <div className="ic">
                <Inbox size={28} />
              </div>
              Pick your GPUs and hit run — results, speedup bars and perf-per-dollar appear here.
            </div>
          )}

          {!running && comparison && (
            <>
              <div className="winners">
                <motion.div
                  className="winner fast"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="wic">
                    <Zap size={20} />
                  </div>
                  <div>
                    <div className="k">Fastest</div>
                    <div className="v">{comparison.fastestGpu ?? "—"}</div>
                    {fastestRow?.medianMs != null && (
                      <div className="sub">
                        <CountUp value={fastestRow.medianMs} decimals={4} suffix=" ms" />
                      </div>
                    )}
                  </div>
                </motion.div>
                <motion.div
                  className="winner value"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 }}
                >
                  <div className="wic">
                    <DollarSign size={20} />
                  </div>
                  <div>
                    <div className="k">Best value</div>
                    <div className="v">{comparison.bestValueGpu ?? "—"}</div>
                    {valueRow?.speedPerDollar != null && (
                      <div className="sub">
                        <CountUp value={Math.round(valueRow.speedPerDollar)} /> perf/$
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>

              <div className="bars">
                {comparison.rows.map((r, i) => {
                  const width =
                    r.medianMs !== null && fastestMedian !== Infinity
                      ? (fastestMedian / r.medianMs) * 100
                      : 0;
                  return (
                    <div className="barrow" key={r.gpu}>
                      <span className="glabel">
                        {r.gpu}
                        {r.gpu === comparison.fastestGpu && <Zap size={13} color="#635bff" />}
                        {r.gpu === comparison.bestValueGpu && (
                          <DollarSign size={13} color="#1a9d6b" />
                        )}
                      </span>
                      <div className="bartrack">
                        <motion.div
                          className={`barfill${r.medianMs === null ? " failed" : ""}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${r.medianMs === null ? 100 : width}%` }}
                          transition={{ duration: 0.6, delay: i * 0.07, ease: "easeOut" }}
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
                      <td>
                        {r.speedupVsSlowest === null ? "—" : `${r.speedupVsSlowest.toFixed(2)}×`}
                      </td>
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
