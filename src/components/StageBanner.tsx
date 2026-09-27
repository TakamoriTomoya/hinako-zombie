interface Props {
  text: string;
  sub?: string;
}

// ステージの始めの「STAGE 2」(と場所の名前)や、ボスを倒した時の「STAGE CLEAR!」を画面中央に大きく出す
export function StageBanner({ text, sub }: Props) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[34%] flex flex-col items-center gap-2">
      <div className="text-outline font-heading text-[40px] leading-none font-extrabold text-white">{text}</div>
      {sub && <div className="text-outline font-heading text-lg font-bold text-white">{sub}</div>}
    </div>
  );
}
