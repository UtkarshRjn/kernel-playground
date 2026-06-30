"use client";

import { buildComparison, type Comparison } from "@kp/core";
import { type GpuType, type KernelLanguage } from "@kp/shared";
import { motion } from "framer-motion";
import {
  BarChart3,
  Check,
  Copy,
  DollarSign,
  FileCode2,
  FlaskConical,
  RotateCcw,
  Send,
  Terminal,
  Zap,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CountUp } from "@/components/CountUp";
import { GpuSelector } from "@/components/GpuSelector";
import { Header } from "@/components/Header";
import { track } from "@/components/posthog";
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

type ConTone = "idle" | "busy" | "pass" | "fail";
interface ConState {
  tone: ConTone;
  label: string;
  title?: string;
  detail?: string;
}

function fmt(n: number | null, digits = 4): string {
  return n === null ? "—" : n.toFixed(digits);
}

export default function Playground() {
  const [language, setLanguage] = useState<KernelLanguage>("cuda");
  const [code, setCode] = useState(STARTER_CUDA);
  const [selected, setSelected] = useState<Set<GpuType>>(new Set(DEFAULT_GPUS));
  const [testing, setTesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tested, setTested] = useState<"pass" | "fail" | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [liveTargets, setLiveTargets] = useState<
    Awaited<ReturnType<typeof trpc.run.status.query>>["targets"] | null
  >(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [con, setCon] = useState<ConState>({
    tone: "idle",
    label: "Ready",
    title: "Test (free) checks your kernel compiles. Then Submit to benchmark across GPUs.",
  });

  useEffect(() => {
    trpc.run.credits
      .query()
      .then((c) => setCredits(c.balance))
      .catch(() => {});
  }, []);

  function refreshCredits() {
    return trpc.run.credits
      .query()
      .then((c) => setCredits(c.balance))
      .catch(() => {});
  }

  function onCodeChange(v: string) {
    setCode(v);
    setTested(null); // editing invalidates a prior passing test
  }

  function switchLanguage(lang: KernelLanguage) {
    setLanguage(lang);
    setCode(STARTERS[lang]);
    setTested(null);
    setComparison(null);
    setCon({ tone: "idle", label: "Ready", title: "Test your kernel, then submit to compare GPUs." });
  }

  function toggle(gpu: GpuType) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(gpu)) next.delete(gpu);
      else next.add(gpu);
      return next;
    });
  }

  async function test() {
    setTesting(true);
    setCon({ tone: "busy", label: "Compiling", title: "Checking your kernel compiles…" });
    try {
      const res = await trpc.run.test.mutate({ language, code });
      track("kernel_tested", { language, status: res.status });
      if (res.status === "succeeded") {
        setTested("pass");
        setCon({
          tone: "pass",
          label: "Compiles",
          title: "Your kernel compiles cleanly — ready to submit.",
          detail: res.stdout?.trim() || undefined,
        });
        toast.success("Compiles — ready to submit");
      } else if (res.status === "compile_error") {
        setTested("fail");
        setCon({
          tone: "fail",
          label: "Compile error",
          title: "Compilation failed",
          detail: res.diagnostics || res.stderr || "Unknown compile error",
        });
        toast.error("Compilation failed");
      } else {
        setTested("fail");
        setCon({
          tone: "fail",
          label: "Error",
          title: "Could not check the kernel",
          detail: res.diagnostics || res.stderr || res.status,
        });
        toast.error("Test failed");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCon({ tone: "fail", label: "Error", title: "Could not check the kernel", detail: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setComparison(null);
    setLiveTargets(null);
    setCon({ tone: "busy", label: "Submitting", title: `Queuing on ${selected.size} GPUs…` });
    try {
      // Enqueue — returns immediately with a run id; the GPU work runs in the background.
      const { runId } = await trpc.run.submit.mutate({ language, code, gpus: [...selected] });
      track("kernel_submitted", { language, gpus: [...selected] });

      const terminal = new Set(["succeeded", "partial", "error"]);
      let view: Awaited<ReturnType<typeof trpc.run.status.query>> | null = null;
      for (let i = 0; i < 160; i++) {
        view = await trpc.run.status.query({ runId });
        setLiveTargets(view.targets);
        const done = view.targets.filter((t) => t.status !== "queued" && t.status !== "running").length;
        setCon({
          tone: "busy",
          label: "Running",
          title: `Benchmarking… ${done}/${view.targets.length} GPUs done`,
        });
        if (terminal.has(view.status)) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!view || !terminal.has(view.status)) throw new Error("run timed out — please retry");

      setComparison(buildComparison(view.targets));
      await refreshCredits();
      const ok = view.targets.filter((t) => t.status === "succeeded").length;
      const failed = view.targets.filter((t) => t.status !== "succeeded");
      setCon({
        tone: failed.length ? "fail" : "pass",
        label: failed.length ? "Partial" : "Submitted",
        title: `Ran on ${ok}/${view.targets.length} GPUs · ${view.creditsCharged} credits`,
        detail: failed.length ? failed.map((t) => `${t.gpu}: ${t.status}`).join("\n") : undefined,
      });
      toast.success(`Submitted · ${view.creditsCharged} credits`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCon({ tone: "fail", label: "Error", title: msg });
      toast.error(msg);
    } finally {
      setSubmitting(false);
      setLiveTargets(null);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(code);
    toast.success("Copied to clipboard");
  }
  function reset() {
    setCode(STARTERS[language]);
    setTested(null);
    toast.success("Reset to starter kernel");
  }

  const busy = testing || submitting;
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
          <p>Write a kernel, test it, then submit to compare across real GPUs.</p>
        </div>

        <div className="pg-layout">
          {/* Left: editor + console */}
          <div className="col-left">
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
              <div className="editor-area">
                <CodeEditor value={code} language={language} onChange={onCodeChange} />
              </div>
              <div className="editor-status">
                <span>{language === "cuda" ? "CUDA C++" : "Triton · Python"}</span>
                <span>{lines} lines</span>
                <span
                  className={tested === "pass" ? "ok" : ""}
                  style={{ marginLeft: "auto" }}
                >
                  {busy ? "Running…" : tested === "pass" ? "● Tested" : "● Ready"}
                </span>
              </div>
            </div>

            {/* Console */}
            <div className="console">
              <div className="console-head">
                <span className="title">
                  <Terminal size={14} /> Console
                </span>
                <span className={`status-pill ${con.tone}`}>
                  {con.tone === "busy" && <span className="spinner" style={{ borderTopColor: "currentColor", borderColor: "rgba(0,0,0,0.15)" }} />}
                  {con.label}
                </span>
              </div>
              <div className="console-body">
                {con.title && (
                  <div className={con.tone === "fail" ? "cline-err" : con.tone === "pass" ? "cline-ok" : con.tone === "idle" ? "console-empty" : ""}>
                    {con.tone === "pass" ? "✓ " : con.tone === "fail" ? "✗ " : ""}
                    {con.title}
                  </div>
                )}
                {con.detail && <div className="cdim" style={{ marginTop: 8 }}>{con.detail}</div>}
              </div>
            </div>
          </div>

          {/* Right: GPU selector + actions */}
          <div className="side">
            <GpuSelector
              selected={selected}
              onToggle={toggle}
              onPreset={(gpus) => setSelected(new Set(gpus))}
            />
            <div className="action-row">
              <button className="btn btn-ghost run-btn" disabled={busy} onClick={test}>
                {testing ? (
                  <>
                    <span
                      className="spinner"
                      style={{ borderTopColor: "var(--text)", borderColor: "var(--border-strong)" }}
                    />{" "}
                    Compiling…
                  </>
                ) : (
                  <>
                    <FlaskConical size={16} /> Test (free)
                  </>
                )}
              </button>
              <button
                className="btn btn-primary run-btn"
                disabled={busy || selected.size === 0 || tested !== "pass"}
                onClick={submit}
              >
                {submitting ? (
                  <>
                    <span className="spinner" /> Submitting…
                  </>
                ) : (
                  <>
                    <Send size={15} /> Submit · {selected.size} GPU{selected.size === 1 ? "" : "s"}
                  </>
                )}
              </button>
              {tested !== "pass" && !busy && (
                <span className="hint">Run a passing test before submitting.</span>
              )}
            </div>
          </div>
        </div>

        <section className="results">
          {submitting && (
            <div className="bars">
              {[...selected].map((g) => {
                const t = liveTargets?.find((x) => x.gpu === g);
                const done = t && t.status !== "queued" && t.status !== "running";
                const ms = t?.stats?.medianMs ?? null;
                return (
                  <div className="barrow" key={g}>
                    <span className="glabel">
                      {g} {done && t?.status === "succeeded" && <Check size={13} color="var(--green)" />}
                    </span>
                    {done ? (
                      <div className="bartrack">
                        <div
                          className={`barfill${t?.status !== "succeeded" ? " failed" : ""}`}
                          style={{ width: t?.status === "succeeded" ? "100%" : "100%" }}
                        />
                      </div>
                    ) : (
                      <div className="skrow" />
                    )}
                    <span className="btime">
                      {done ? (ms !== null ? `${ms.toFixed(4)} ms` : t?.status) : "…"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {!submitting && !comparison && (
            <div className="empty">
              <div className="ic">
                <BarChart3 size={24} />
              </div>
              <div className="empty-title">No results yet</div>
              <div className="empty-sub">
                Hit <b>Test (free)</b> to check your kernel compiles, then <b>Submit</b> to
                benchmark it across your selected GPUs — speedup bars and perf-per-dollar land
                here.
              </div>
            </div>
          )}

          {!submitting && comparison && (
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
                        {r.gpu === comparison.fastestGpu && <Zap size={13} color="var(--accent)" />}
                        {r.gpu === comparison.bestValueGpu && (
                          <DollarSign size={13} color="var(--green)" />
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
