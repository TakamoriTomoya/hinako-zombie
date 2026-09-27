import { AmmoLabel } from "../components/AmmoLabel";
import { LivesLabel } from "../components/LivesLabel";
import { BossHpBar } from "../components/BossHpBar";
import { BossWarning } from "../components/BossWarning";
import { Joystick } from "../components/Joystick";
import { ReloadButton } from "../components/ReloadButton";
import { StageBanner } from "../components/StageBanner";
import { WeaponBar } from "../components/WeaponBar";
import type { PageSlots } from "../components/BasePage";
import type { BossHp, StageBannerText } from "../lib/engine";
import { WEAPONS, type SpecialWeaponId, type WeaponId } from "../lib/weapons";

interface Props {
  stage: number;
  areaName: string;
  stageBanner: StageBannerText | null;
  score: number;
  lives: number;
  ammo: number;
  reloading: boolean;
  weapon: WeaponId;
  weaponAmmo: Record<SpecialWeaponId, number>;
  onSelectWeapon: (id: WeaponId) => void;
  bossHp: BossHp | null;
  bossWarning: boolean;
  exitOpen: boolean;
  hintVisible: boolean;
  onReload: () => void;
  onMove: (x: number, y: number) => void;
}

export function BattlePage({ stage, areaName, stageBanner, score, lives, ammo, reloading, weapon, weaponAmmo, onSelectWeapon, bossHp, bossWarning, exitOpen, hintVisible, onReload, onMove }: Props): PageSlots {
  return {
    // 上: スコア・ライフ・場所の名前(ボス戦ではボスのHP)と、武器・弾(右)
    header: (
      <div className="flex w-full max-w-[560px] flex-col gap-1.5 px-4">
        <div className="flex items-center justify-between">
          <div className="font-heading text-2xl font-bold text-white text-outline">{score.toLocaleString()}</div>
          <LivesLabel lives={lives} />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {bossHp !== null ? (
              <BossHpBar name={bossHp.name} percent={bossHp.percent} />
            ) : (
              <div className="truncate font-heading text-sm font-bold text-white text-outline">
                STAGE {stage}・{areaName}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <WeaponBar weapon={weapon} weaponAmmo={weaponAmmo} onSelect={onSelectWeapon} />
            {weapon === "pistol" ? (
              <div className="flex items-center gap-2">
                <AmmoLabel ammo={ammo} reloading={reloading} />
                <ReloadButton ammo={ammo} reloading={reloading} onReload={onReload} />
              </div>
            ) : (
              <div className="font-heading text-lg leading-8 font-extrabold text-outline" style={{ color: WEAPONS[weapon].color }}>
                {WEAPONS[weapon].name} ×{weaponAmmo[weapon]}
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    center: (
      <>
        {bossWarning ? <BossWarning /> : stageBanner && <StageBanner text={stageBanner.title} sub={stageBanner.sub} />}
        {exitOpen && !stageBanner && (
          <div className="pointer-events-none absolute inset-x-0 top-[24%] flex justify-center">
            <div className="animate-pulse text-center font-heading text-lg font-bold text-[#8dffb0] text-outline">でぐち(つぎへ)に むかおう!</div>
          </div>
        )}
        {hintVisible && (
          <div className="pointer-events-none absolute inset-x-0 top-[58%] flex justify-center">
            <div className="animate-pulse text-center font-heading text-base font-bold text-white text-outline">
              タップで うつ・ドラッグで むきをかえる
              <br />
              左下のスティックで あるく
            </div>
          </div>
        )}
      </>
    ),
    // 左下: 歩くスティック(音のボタンの上)。右下は武器があるので空ける
    bottom: (
      <div className="flex w-full -translate-y-10 pl-4">
        <Joystick onMove={onMove} />
      </div>
    ),
  };
}
