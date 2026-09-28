import { LivesLabel } from "../components/LivesLabel";
import { BossHpBar } from "../components/BossHpBar";
import { BossWarning } from "../components/BossWarning";
import { Joystick } from "../components/Joystick";
import { PauseButton } from "../components/PauseButton";
import { StageBanner } from "../components/StageBanner";
import { WeaponBar } from "../components/WeaponBar";
import type { PageSlots } from "../components/BasePage";
import type { BossHp, StageBannerText } from "../lib/engine";
import type { SpecialWeaponId, WeaponId } from "../lib/weapons";

interface Props {
  stage: number;
  areaName: string;
  stageBanner: StageBannerText | null;
  score: number;
  lives: number;
  weapon: WeaponId;
  weaponAmmo: Record<SpecialWeaponId, number>;
  onSelectWeapon: (id: WeaponId) => void;
  bossHp: BossHp | null;
  bossWarning: boolean;
  exitOpen: boolean;
  advanceHint: boolean;
  hintVisible: boolean;
  onMove: (x: number, y: number) => void;
  onPause: () => void;
}

export function BattlePage({ stage, areaName, stageBanner, score, lives, weapon, weaponAmmo, onSelectWeapon, bossHp, bossWarning, exitOpen, advanceHint, hintVisible, onMove, onPause }: Props): PageSlots {
  return {
    // 上: 左に一時停止、右にスコアとステージ(場所の名前)。ボス戦ではその下にボスのHP
    header: (
      <div className="flex w-full flex-col gap-1.5 px-4">
        <div className="flex items-start justify-between gap-3">
          <PauseButton onPause={onPause} />
          <div className="flex min-w-0 flex-col items-end">
            <div className="font-heading text-2xl leading-tight font-bold text-white text-outline">{score.toLocaleString()}</div>
            <div className="max-w-full truncate font-heading text-sm font-bold text-white text-outline">
              STAGE {stage}・{areaName}
            </div>
          </div>
        </div>
        {bossHp !== null && <BossHpBar name={bossHp.name} percent={bossHp.percent} />}
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
        {advanceHint && !stageBanner && (
          <div className="pointer-events-none absolute inset-x-0 top-[24%] flex justify-center">
            <div className="animate-pulse text-center font-heading text-lg font-bold text-[#ffe066] text-outline">まえに すすもう!</div>
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
    // 左下: 歩くスティック。右下: ライフと、武器の持ちかえ
    bottom: (
      <div className="flex w-full -translate-y-2 items-end justify-between px-4">
        <Joystick onMove={onMove} />
        <div className="flex flex-col items-end gap-1.5">
          <LivesLabel lives={lives} />
          <WeaponBar weapon={weapon} weaponAmmo={weaponAmmo} onSelect={onSelectWeapon} />
        </div>
      </div>
    ),
  };
}
