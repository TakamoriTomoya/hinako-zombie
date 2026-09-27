import { MAX_AMMO } from "../lib/constants";

interface Props {
  ammo: number;
  reloading: boolean;
}

// のこりの弾。撃ったぶんは薄く残して、あと何発撃てるかをひと目でわかるようにする
export function AmmoLabel({ ammo, reloading }: Props) {
  return (
    <div className="flex flex-col gap-1" aria-label={`のこりの弾 ${ammo}`}>
      <div className="flex gap-[3px]">
        {Array.from({ length: MAX_AMMO }, (_, i) => (
          <div
            key={i}
            className={`h-5 w-2 rounded-t-full ${i < ammo && !reloading ? "bg-secondary shadow-[0_0_0_1.5px_var(--color-outline)]" : "bg-white/25"}`}
          />
        ))}
      </div>
      {reloading && <div className="animate-pulse font-heading text-xs font-bold text-white text-outline">リロードちゅう…</div>}
    </div>
  );
}
