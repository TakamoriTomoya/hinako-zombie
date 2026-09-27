import { AmmoLabel } from "../components/AmmoLabel";
import { LivesLabel } from "../components/LivesLabel";
import { BossHpBar } from "../components/BossHpBar";
import { BossWarning } from "../components/BossWarning";
import { ReloadButton } from "../components/ReloadButton";
import { StageBanner } from "../components/StageBanner";
import type { PageSlots } from "../components/BasePage";
import type { BossHp, StageBannerText } from "../lib/engine";

interface Props {
  stage: number;
  stageBanner: StageBannerText | null;
  score: number;
  lives: number;
  ammo: number;
  reloading: boolean;
  bossHp: BossHp | null;
  bossWarning: boolean;
  hintVisible: boolean;
  onReload: () => void;
}

export function BattlePage({ stage, stageBanner, score, lives, ammo, reloading, bossHp, bossWarning, hintVisible, onReload }: Props): PageSlots {
  return {
    header: (
      // 横長のPC画面でもスコアやHPが離れすぎないよう、幅に上限をつける
      <div className="flex w-full max-w-[520px] flex-col gap-1.5 px-6">
        <div className="flex items-center justify-between">
          <div className="font-heading text-2xl font-bold text-white text-outline">{score.toLocaleString()}</div>
          <LivesLabel lives={lives} />
        </div>
        {bossHp !== null ? (
          <BossHpBar name={bossHp.name} percent={bossHp.percent} />
        ) : (
          <div className="font-heading text-sm font-bold text-white text-outline">STAGE {stage}</div>
        )}
      </div>
    ),
    center: (
      <>
        {bossWarning ? <BossWarning /> : stageBanner && <StageBanner text={stageBanner.title} sub={stageBanner.sub} />}
        {hintVisible && (
          <div className="pointer-events-none absolute inset-x-0 top-[62%] flex justify-center">
            <div className="animate-pulse text-center font-heading text-lg font-bold text-white text-outline">
              ゾンビを タップ / クリックで うつ
              <br />
              <span className="text-sm">あたまを ねらうと 一発!</span>
            </div>
          </div>
        )}
      </>
    ),
    // 左下の音のボタンのとなりに、弾の数とリロードボタンを置く(右下は銃があるので空ける)
    bottom: (
      <div className="flex w-full items-end gap-2 pl-16">
        <ReloadButton ammo={ammo} reloading={reloading} onReload={onReload} />
        <AmmoLabel ammo={ammo} reloading={reloading} />
      </div>
    ),
  };
}
