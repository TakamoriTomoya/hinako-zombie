import type { PropsWithChildren, RefObject } from "react";

interface Props {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

// ホーム画面もバトル画面も、この同じcanvas(町・ゾンビ・銃の描画)をそのまま共有する。
// 画面ごとの違いは、この上に重ねるchildren(タイトル/勝敗表示など)だけ。
export function GameCanvas({ canvasRef, children }: PropsWithChildren<Props>) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/*
        widthやheight・CSSでの拡大縮小はJS側(ZombieEngine)に一任する。
        描画バッファの実サイズは毎フレームこの要素の実測サイズに合わせて張り直すため、
        object-fit等の暗黙スケーリングには頼らない。
      */}
      <canvas id="gameCanvas" className="absolute inset-0 touch-none bg-transparent" ref={canvasRef} />
      {/* 画面のすみを暗くして、こわい雰囲気と「自分の目で見ている」感じを出す。
          canvasで毎フレーム描くと重いので、CSSで上に重ねる */}
      <div className="vignette pointer-events-none absolute inset-0" />
      {children}
    </div>
  );
}
