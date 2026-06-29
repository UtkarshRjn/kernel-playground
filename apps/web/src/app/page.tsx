import { GpuType, KernelLanguage } from "@kp/shared";
import { DollarSign, Scale, Sparkles, Target, Zap } from "lucide-react";
import { Header } from "@/components/Header";

const features = [
  {
    icon: <Scale size={20} />,
    title: "Cross-GPU comparison",
    body: "Run one kernel on T4, A100 and B200 at once and see runtime, speedup and bandwidth side by side.",
  },
  {
    icon: <Target size={20} />,
    title: "Trustworthy benchmarks",
    body: "Warmup, L2 flush, CUDA-event timing and median / p95 / stddev — numbers you can actually believe.",
  },
  {
    icon: <DollarSign size={20} />,
    title: "Perf per dollar",
    body: "Every result carries its GPU-second cost, so you know which GPU to rent or buy before you spend.",
  },
  {
    icon: <Zap size={20} />,
    title: "Zero setup",
    body: "No drivers, no toolchain, no instance to spin up. Open a tab, write CUDA or Triton, hit run.",
  },
];

const previewRows = [
  { gpu: "B200", pct: 100, ms: "0.021", tag: "fastest" },
  { gpu: "H100", pct: 72, ms: "0.029", tag: "" },
  { gpu: "A100", pct: 49, ms: "0.043", tag: "" },
  { gpu: "T4", pct: 11, ms: "0.196", tag: "best value" },
];

export default function Home() {
  const gpus = GpuType.options.length;
  const languages = KernelLanguage.options;

  return (
    <>
      <Header
        right={
          <a className="btn btn-primary" href="/playground" style={{ marginLeft: 6 }}>
            Open playground
          </a>
        }
      />

      <main className="container">
        <section className="hero">
          <span className="eyebrow">
            <Sparkles size={14} /> Colab for kernel code
          </span>
          <h1 className="title">
            Write a kernel once.
            <br />
            <span className="gradient-text">Compare it across every GPU.</span>
          </h1>
          <p className="lede">
            A zero-setup playground to write {languages.join(" & ")} kernels and benchmark
            the same code across {gpus} GPUs — side by side, with honest measurements and
            per-dollar cost.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary btn-lg" href="/playground">
              Open the playground →
            </a>
            <a
              className="btn btn-ghost btn-lg"
              href="https://github.com/UtkarshRjn/kernel-playground"
              target="_blank"
              rel="noreferrer"
            >
              View source
            </a>
          </div>

          <div className="preview">
            <div className="bar">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
              <span className="label">vector_add · 3 GPUs</span>
            </div>
            <div className="body">
              <div className="bars">
                {previewRows.map((r) => (
                  <div className="barrow" key={r.gpu}>
                    <span className="glabel">
                      {r.gpu}
                      {r.tag === "fastest" && <Zap size={14} color="#635bff" />}
                      {r.tag === "best value" && <DollarSign size={14} color="#1a9d6b" />}
                    </span>
                    <div className="bartrack">
                      <div className="barfill" style={{ width: `${r.pct}%` }} />
                    </div>
                    <span className="btime">{r.ms} ms</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <h2>What you get</h2>
          <div className="grid">
            {features.map((f) => (
              <div className="card" key={f.title}>
                <div className="ic">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="site">
        Kernel Playground · CUDA &amp; Triton on real GPUs, powered by Modal
      </footer>
    </>
  );
}
