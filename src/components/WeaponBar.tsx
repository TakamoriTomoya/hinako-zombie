import type { ComponentType } from "react";
import { WEAPON_ORDER, WEAPONS, type SpecialWeaponId, type WeaponId } from "../lib/weapons";
import { FlameIcon, GrenadeIcon, MachineGunIcon, PistolIcon, RocketIcon, ShotgunIcon, SniperIcon } from "./icons";

interface Props {
  weapon: WeaponId;
  weaponAmmo: Record<SpecialWeaponId, number>;
  onSelect: (id: WeaponId) => void;
}

const ICONS: Record<WeaponId, ComponentType<{ size?: number }>> = {
  pistol: PistolIcon,
  mg: MachineGunIcon,
  shotgun: ShotgunIcon,
  sniper: SniperIcon,
  flame: FlameIcon,
  rocket: RocketIcon,
  grenade: GrenadeIcon,
};

// 持っている武器のボタン。押すと持ちかえる(PCでは 1〜7 キーでも)。
// ハンドガン(弾切れなし)は、何も拾っていなくてもいつも出す。ほかは拾って弾がある時だけ出す
export function WeaponBar({ weapon, weaponAmmo, onSelect }: Props) {
  const owned = WEAPON_ORDER.filter((id) => id === "pistol" || weaponAmmo[id] > 0);
  return (
    // 武器が多い時は2段に折り返す(スマホの幅でもはみ出さないように)
    <div className="flex max-w-[176px] flex-wrap justify-end gap-1">
      {owned.map((id) => {
        const Icon = ICONS[id];
        const selected = id === weapon;
        return (
          <button
            key={id}
            type="button"
            aria-label={WEAPONS[id].name}
            aria-pressed={selected}
            className={`pointer-events-auto relative flex h-10 w-10 cursor-pointer touch-none items-center justify-center rounded-xl border-2 transition-transform duration-100 active:scale-[0.92] ${
              selected ? "border-white bg-white/30" : "border-transparent bg-black/35 hover:bg-black/50"
            }`}
            style={{ color: WEAPONS[id].color }}
            // 歩くスティックを押しながらでも押せるよう、ふれた瞬間に持ちかえる
            // (ほかの指が画面にふれていると、スマホではクリックが起きないことがある)。キーボードで押した時は onClick で
            onPointerDown={(e) => {
              e.preventDefault();
              onSelect(id);
            }}
            onClick={(e) => {
              if (e.detail === 0) onSelect(id);
            }}
          >
            <Icon size={24} />
            {id !== "pistol" && (
              <span className="text-outline absolute -right-1 -bottom-1 font-heading text-xs leading-none font-extrabold text-white">{weaponAmmo[id]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
