"use client";

import { GPU_LIST, type GpuSpec, type GpuType } from "@kp/shared";
import { Check, Cpu, Gauge } from "lucide-react";

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
  onToggle,
  onPreset,
}: {
  selected: Set<GpuType>;
  onToggle: (gpu: GpuType) => void;
  onPreset: (gpus: GpuType[]) => void;
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Target GPUs</span>
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.label} className="preset" onClick={() => onPreset(p.gpus)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {groupByArch().map(({ arch, gpus }) => (
        <div className="arch-group" key={arch}>
          <div className="arch-label">{arch}</div>
          <div className="gpu-list">
            {gpus.map((spec) => {
              const on = selected.has(spec.type);
              return (
                <div
                  key={spec.type}
                  className={`gpu${on ? " on" : ""}`}
                  onClick={() => onToggle(spec.type)}
                  role="checkbox"
                  aria-checked={on}
                >
                  <div className="gpu-row1">
                    <span className="gpu-name">
                      <span className="check">{on && <Check size={12} strokeWidth={3} />}</span>
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
  );
}
