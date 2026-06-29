import { GpuType, KernelLanguage } from "@kp/shared";

const features = [
  {
    title: "Cross-GPU comparison",
    body: "Run one kernel on T4, A100 and B200 at once. See runtime, throughput and bandwidth side by side.",
    badge: "§3 · core",
  },
  {
    title: "Trustworthy benchmarks",
    body: "Warmup, L2 flush, CUDA-event timing and median/p95/stddev — numbers you can actually believe.",
    badge: "§4 · core",
  },
  {
    title: "Perf per dollar",
    body: "Every result carries its GPU-second cost, so you know which GPU to rent or buy before you spend.",
    badge: "§3 · cost",
  },
  {
    title: "Zero setup",
    body: "No drivers, no toolchain, no instance to spin up. Open a tab, write CUDA or Triton, hit run.",
    badge: "§1 · editor",
  },
];

export default function Home() {
  // Sourced from the shared contracts package — proves the workspace wiring end to end.
  const gpus = GpuType.options;
  const languages = KernelLanguage.options;

  return (
    <main>
      <section className="hero">
        <div className="container">
          <span className="tag">Colab for kernel code</span>
          <h1>Write a kernel once. Compare it across every GPU.</h1>
          <p className="lede">
            A zero-setup playground to write {languages.join(" and ")} kernels and
            benchmark the same code across {gpus.length} GPUs — side by side, with
            honest measurements and per-dollar cost.
          </p>
          <a className="cta" href="/playground">
            Open the playground →
          </a>
        </div>
      </section>

      <section className="container">
        <div className="grid">
          {features.map((f) => (
            <div className="card" key={f.title}>
              <div className="badge">{f.badge}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer>
        <div className="container">
          Kernel Playground · Phase 0 foundation · supported GPUs:{" "}
          {gpus.join(", ")}
        </div>
      </footer>
    </main>
  );
}
