import { CenterSlot } from "../components/CenterSlot";
import { VersionLabel } from "../components/VersionLabel";
import { DevStartPanel } from "../components/DevStartPanel";
import { SoundToggle } from "../components/SoundToggle";
import type { PageSlots } from "../components/BasePage";
import { DEV_TOOLS } from "../lib/constants";
import type { StartOptions } from "../lib/engine";

interface Props {
  highScore: number;
  onStart: () => void;
  devStart: Required<StartOptions>;
  onDevStartChange: (value: Required<StartOptions>) => void;
  muted: boolean;
  onToggleMuted: () => void;
}

// pages/ はマウント/アンマウントされる画面コンポーネントではなく、
// 「このフェーズならBasePageの3スロットに何を入れるか」を決める関数。
// canvasはBasePage側に1つだけ存在し続けるので、画面切り替えで再生成されない。
export function HomePage({ highScore, onStart, devStart, onDevStartChange, muted, onToggleMuted }: Props): PageSlots {
  return {
    header: (
      // 左に音のオン/オフ、右にバージョン。画面のはしから同じだけあけて、左右対称に置く
      <div className="flex w-full items-center justify-between px-6">
        <SoundToggle muted={muted} onToggle={onToggleMuted} placement="inline" />
        <VersionLabel />
      </div>
    ),
    center: (
      <CenterSlot>
        <span className="text-zombie">ゾンビ</span>
        <br />
        ひなこ
        <br />
        <span className="text-[26px]">シューティング</span>
      </CenterSlot>
    ),
    bottom: (
      <div className="relative flex w-full -translate-y-12 flex-col items-center gap-3 px-6">
        {/* 開発用の欄は、ハイスコアとスタートボタンの位置を動かさないよう、その上に浮かせて置く */}
        {DEV_TOOLS && (
          <div className="absolute inset-x-6 bottom-full mb-3 flex justify-center">
            <DevStartPanel value={devStart} onChange={onDevStartChange} />
          </div>
        )}
        {highScore > 0 && (
          <div className="font-heading text-sm font-bold text-white text-outline">ハイスコア {highScore.toLocaleString()}</div>
        )}
        <button
          type="button"
          className="pointer-events-auto w-full max-w-[280px] cursor-pointer rounded-full border-0 bg-green py-4 font-heading text-lg font-bold text-white shadow-[0_4px_0_var(--color-green-shadow)] transition-transform duration-100 hover:bg-green-hover active:scale-[0.96]"
          onClick={onStart}
        >
          スタート
        </button>
      </div>
    ),
  };
}
