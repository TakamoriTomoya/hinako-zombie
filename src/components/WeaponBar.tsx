import type { ComponentType } from "react";
import { WEAPON_ORDER, WEAPONS, type SpecialWeaponId, type WeaponId } from "../lib/weapons";
import { GrenadeIcon, MachineGunIcon, PistolIcon, RocketIcon } from "./icons";

interface Props {
  weapon: WeaponId;
  weaponAmmo: Record<SpecialWeaponId, number>;
  onSelect: (id: WeaponId) => void;
}

const ICONS: Record<WeaponId, ComponentType<{ size?: number }>> = {
  pistol: PistolIcon,
  mg: MachineGunIcon,
  rocket: RocketIcon,
  grenade: GrenadeIcon,
};

// 持っている武器のボタン。押すと持ちかえる(PCでは 1〜4 キーでも)。
// ハンドガンはいつも出し、ほかは拾って弾がある時だけ出す
export function WeaponBar({ weapon, weaponAmmo, onSelect }: Props) {
  const owned = WEAPON_ORDER.filter((id) => id === "pistol" || weaponAmmo[id] > 0);
  if (owned.length < 2) return null;
  return (
    <div className="flex gap-1.5">
      {owned.map((id) => {
        const Icon = ICONS[id];
        const selected = id === weapon;
        return (
          <button
            key={id}
            type="button"
            aria-label={WEAPONS[id].name}
            aria-pressed={selected}
            className={`pointer-events-auto relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border-2 transition-transform duration-100 active:scale-[0.92] ${
              selected ? "border-white bg-white/30" : "border-transparent bg-black/35 hover:bg-black/50"
            }`}
            style={{ color: WEAPONS[id].color }}
            onClick={() => onSelect(id)}
          >
            <Icon size={26} />
            {id !== "pistol" && (
              <span className="text-outline absolute -right-1 -bottom-1 font-heading text-xs leading-none font-extrabold text-white">{weaponAmmo[id]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
