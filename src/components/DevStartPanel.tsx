import { STAGES } from "../lib/constants";
import type { StartOptions } from "../lib/engine";

interface Props {
  value: Required<StartOptions>;
  onChange: (value: Required<StartOptions>) => void;
}

// 開発用: 好きなステージ(ボスから)で始められるようにする
export function DevStartPanel({ value, onChange }: Props) {
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-black/50 px-4 py-2 font-heading text-sm font-bold text-white">
      <span className="text-white/60">DEV</span>
      <label className="flex items-center gap-1">
        STAGE
        <select
          className="rounded bg-white/90 px-1 text-text-dark"
          value={value.stageIndex}
          onChange={(e) => onChange({ ...value, stageIndex: Number(e.target.value) })}
        >
          {STAGES.map((_, i) => (
            <option key={i} value={i}>
              {i + 1}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={value.startAtBoss} onChange={(e) => onChange({ ...value, startAtBoss: e.target.checked })} />
        ボスから
      </label>
    </div>
  );
}
