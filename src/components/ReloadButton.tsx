import { MAX_AMMO } from "../lib/constants";

interface Props {
  ammo: number;
  reloading: boolean;
  onReload: () => void;
}

// スマホでもリロードできるボタン(PCでは右クリックか R キーでもできる)。弾が少ない時は目立たせる
export function ReloadButton({ ammo, reloading, onReload }: Props) {
  const low = ammo <= 2 && !reloading;
  return (
    <button
      type="button"
      disabled={reloading || ammo === MAX_AMMO}
      className={`pointer-events-auto h-10 cursor-pointer touch-none rounded-full border-0 px-4 font-heading text-sm font-bold text-white transition-transform duration-100 active:scale-[0.94] disabled:cursor-default disabled:opacity-40 ${
        low ? "animate-pulse bg-primary shadow-[0_3px_0_var(--color-primary-shadow)]" : "bg-white/15 hover:bg-white/25"
      }`}
      // 歩くスティックを押しながらでも押せるよう、ふれた瞬間にリロードする。キーボードで押した時は onClick で
      onPointerDown={(e) => {
        e.preventDefault();
        onReload();
      }}
      onClick={(e) => {
        if (e.detail === 0) onReload();
      }}
    >
      リロード
    </button>
  );
}
