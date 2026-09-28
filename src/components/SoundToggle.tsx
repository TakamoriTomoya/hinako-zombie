import { SoundOffIcon, SoundOnIcon } from "./icons";

interface Props {
  muted: boolean;
  onToggle: () => void;
  // inline: 置かれた場所にそのまま出す(トップ画面の上の帯で、バージョン表示と左右対称に置く)
  // bottom-left: 画面の左下に固定して出す(結果画面。左上には「戻る」があるので)
  placement: "inline" | "bottom-left";
}

export function SoundToggle({ muted, onToggle, placement }: Props) {
  const position = placement === "bottom-left" ? "fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-10" : "";
  return (
    <button
      type="button"
      className={`pointer-events-auto ${position} flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-white/15 text-white transition-transform duration-100 hover:bg-white/25 active:scale-[0.92]`}
      aria-label={muted ? "音を出す" : "音を消す"}
      aria-pressed={muted}
      onClick={onToggle}
    >
      {muted ? <SoundOffIcon size={20} /> : <SoundOnIcon size={20} />}
    </button>
  );
}
