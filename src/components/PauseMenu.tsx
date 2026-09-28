import { SoundOffIcon, SoundOnIcon } from "./icons";

interface Props {
  muted: boolean;
  onResume: () => void;
  onRestart: () => void;
  onHome: () => void;
  onToggleMuted: () => void;
}

const buttonBase =
  "pointer-events-auto flex h-12 w-full max-w-[260px] cursor-pointer items-center justify-center gap-2 rounded-full border-0 font-heading text-lg font-bold transition-transform duration-100 active:scale-[0.96]";

// 一時停止中に出すメニュー。つづける・さいしょから・タイトルへ・音のオン/オフ
export function PauseMenu({ muted, onResume, onRestart, onHome, onToggleMuted }: Props) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/60 px-8 backdrop-blur-[2px]" role="dialog" aria-label="いちじていし">
      <div className="text-outline mb-2 font-heading text-[40px] leading-none font-extrabold text-white">ポーズ</div>
      <button type="button" className={`${buttonBase} bg-green text-white shadow-[0_4px_0_var(--color-green-shadow)] hover:bg-green-hover`} onClick={onResume}>
        つづける
      </button>
      <button type="button" className={`${buttonBase} bg-ghost-bg text-ghost-text shadow-[0_4px_0_var(--color-ghost-shadow)] hover:bg-ghost-hover`} onClick={onRestart}>
        さいしょから
      </button>
      <button type="button" className={`${buttonBase} bg-ghost-bg text-ghost-text shadow-[0_4px_0_var(--color-ghost-shadow)] hover:bg-ghost-hover`} onClick={onHome}>
        タイトルへ
      </button>
      <button type="button" className={`${buttonBase} bg-white/15 text-white hover:bg-white/25`} aria-pressed={muted} onClick={onToggleMuted}>
        {muted ? <SoundOffIcon size={20} /> : <SoundOnIcon size={20} />}
        {muted ? "おと: オフ" : "おと: オン"}
      </button>
    </div>
  );
}
