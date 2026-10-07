"use client";

import { GPU_LIST, type GpuSpec, type GpuType } from "@kp/shared";
import { Check, Cpu, Gauge, Lock } from "lucide-react";

const PRESETS: { label: string; gpus: GpuType[] }[] = [
  { label: "Budget", gpus: ["T4", "L4"] },
  { label: "Balanced", gpus: ["A100_80GB"] },
  { label: "Flagship", gpus: ["H100", "B200"] },
  { label: "All", gpus: GPU_LIST.map((g) => g.type) },
];

// Group GPUs by architecture, preserving catalog order.
function groupByArch(): { arch: string; gpus: GpuSpec[] }[] {
  const order: string[] = [];
  const map = new Map<string, GpuSpec[]>();
  for (const g of GPU_LIST) {
    if (!map.has(g.arch)) {
      map.set(g.arch, []);
      order.push(g.arch);
    }
    map.get(g.arch)!.push(g);
  }
  return order.map((arch) => ({ arch, gpus: map.get(arch)! }));
}

const MAX_VRAM = Math.max(...GPU_LIST.map((g) => g.memoryGb));

export function GpuSelector({
  selected,
  allowedTiers,
  onToggle,
  onPreset,
}: {
  selected: Set<GpuType>;
  /** Tiers the user may run on; null while loading (nothing shown as locked). */
  allowedTiers: GpuSpec["tier"][] | null;
  onToggle: (gpu: GpuType) => void;
  onPreset: (gpus: GpuType[]) => void;
}) {
  const isLocked = (spec: GpuSpec) => allowedTiers !== null && !allowedTiers.includes(spec.tier);
  const unlocked = (gpus: GpuType[]) =>
    gpus.filter((g) => !isLocked(GPU_LIST.find((s) => s.type === g)!));

  return (
    <div className="panel gpu-panel">
      <div className="panel-head">
        <span className="label">Target GPUs</span>
        <div className="presets">
          {PRESETS.map((p) => {
            const gpus = unlocked(p.gpus);
            return (
              <button
                key={p.label}
                className="preset"
                disabled={gpus.length === 0}
                title={gpus.length === 0 ? "Not available on the free tier" : undefined}
                onClick={() => onPreset(gpus)}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="gpu-scroll">
        {groupByArch().map(({ arch, gpus }) => (
        <div className="arch-group" key={arch}>
          <div className="arch-label">{arch}</div>
          <div className="gpu-list">
            {gpus.map((spec) => {
              const locked = isLocked(spec);
              const on = !locked && selected.has(spec.type);
              return (
                <div
                  key={spec.type}
                  className={`gpu${on ? " on" : ""}${locked ? " locked" : ""}`}
                  onClick={() => !locked && onToggle(spec.type)}
                  role="checkbox"
                  aria-checked={on}
                  aria-disabled={locked}
                  title={locked ? `${spec.tier} GPUs aren't available on the free tier yet` : undefined}
                >
                  <div className="gpu-row1">
                    <span className="gpu-name">
                      <span className="check">
                        {locked ? <Lock size={10} strokeWidth={2.5} /> : on && <Check size={12} strokeWidth={3} />}
                      </span>
                      {spec.label}
                      <span className={`tier ${spec.tier}`}>{spec.tier}</span>
                    </span>
                    <span className="gpu-price">${(spec.pricePerSec * 3600).toFixed(2)}/hr</span>
                  </div>
                  <div className="gpu-specs">
                    <span className="spec">
                      <Cpu size={12} /> {spec.memoryGb} GB
                    </span>
                    <span className="spec">
                      <Gauge size={12} /> {Math.round(spec.memoryBandwidthGbs)} GB/s
                    </span>
                    <span className="spec">{spec.fp16Tflops} TF (fp16)</span>
                    {locked && <span className="spec gpu-lock-hint">Locked · free tier</span>}
                  </div>
                  <div className="membar">
                    <div style={{ width: `${(spec.memoryGb / MAX_VRAM) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        ))}
      </div>
    </div>
  );
}
