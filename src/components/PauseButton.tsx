import { PauseIcon } from "./icons";

interface Props {
  onPause: () => void;
}

// 遊んでいる時に、スコアの左に出す一時停止ボタン(PCでは Esc か P キーでも)
export function PauseButton({ onPause }: Props) {
  return (
    <button
      type="button"
      aria-label="いちじていし"
      className="pointer-events-auto flex h-9 w-9 shrink-0 cursor-pointer touch-none items-center justify-center rounded-full border-0 bg-white/20 text-white transition-transform duration-100 hover:bg-white/30 active:scale-[0.92]"
      onPointerDown={(e) => {
        e.preventDefault();
        onPause();
      }}
      onClick={(e) => {
        if (e.detail === 0) onPause();
      }}
    >
      <PauseIcon size={18} />
    </button>
  );
}
