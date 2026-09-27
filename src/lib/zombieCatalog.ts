// ゾンビに使う画像の設定。
// sizeScale は立っている人の高さ(ZOMBIE_HEIGHT_M)に対する倍率。寝そべり・うずくまりの写真は低くする。
// head は頭の位置(ヘッドショットの判定に使う)。cx は画像の幅に対する割合、cy と r は画像の高さに対する割合。
// name はボスとして出てきた時に「でかゾンビ○○」と表示する名前。
// 新しい画像ファイルを public/images/ に追加したら、ここに追記する。

export interface HeadCircle {
  cx: number;
  cy: number;
  r: number;
}

export interface ZombieImageDef {
  file: string;
  name: string;
  sizeScale: number;
  head: HeadCircle;
}

export const ZOMBIE_IMAGE_FILES: ZombieImageDef[] = [
  { file: "boy-hinako.PNG", name: "しょうねんひなこ", sizeScale: 0.85, head: { cx: 0.28, cy: 0.1, r: 0.09 } },
  { file: "dance-hinako.PNG", name: "だんすひなこ", sizeScale: 1.0, head: { cx: 0.66, cy: 0.09, r: 0.07 } },
  { file: "gassho-hinako.PNG", name: "がっしょうひなこ", sizeScale: 0.85, head: { cx: 0.47, cy: 0.1, r: 0.09 } },
  { file: "goo-hinako.PNG", name: "ぐぅーひなこ", sizeScale: 1.0, head: { cx: 0.5, cy: 0.08, r: 0.07 } },
  { file: "gorori-hinako.PNG", name: "ごろりひなこ", sizeScale: 0.6, head: { cx: 0.4, cy: 0.35, r: 0.22 } },
  { file: "gyaku-hinako.PNG", name: "ぎゃくぅひなこ", sizeScale: 1.0, head: { cx: 0.38, cy: 0.08, r: 0.07 } },
  { file: "lego-hinako.PNG", name: "れごひなこ", sizeScale: 1.05, head: { cx: 0.47, cy: 0.07, r: 0.06 } },
  { file: "mouhu-hinako.PNG", name: "もうふひなこ", sizeScale: 0.85, head: { cx: 0.47, cy: 0.1, r: 0.08 } },
  { file: "neko-hinako.PNG", name: "ねこひなこ", sizeScale: 0.6, head: { cx: 0.13, cy: 0.3, r: 0.15 } },
  { file: "panpan-hinako.PNG", name: "ぱんぱんひなこ", sizeScale: 1.0, head: { cx: 0.47, cy: 0.1, r: 0.07 } },
  { file: "perm-hinako.PNG", name: "ぱーまひなこ", sizeScale: 0.7, head: { cx: 0.47, cy: 0.12, r: 0.08 } },
  { file: "red-hinako.PNG", name: "あかひなこ", sizeScale: 1.0, head: { cx: 0.47, cy: 0.09, r: 0.07 } },
  { file: "sit-hinako.PNG", name: "おすわりひなこ", sizeScale: 0.8, head: { cx: 0.48, cy: 0.15, r: 0.1 } },
  { file: "sorori-hinako.PNG", name: "そろりひなこ", sizeScale: 0.95, head: { cx: 0.48, cy: 0.09, r: 0.07 } },
  { file: "tako-hinako.PNG", name: "たこひなこ", sizeScale: 0.9, head: { cx: 0.44, cy: 0.12, r: 0.1 } },
  { file: "yazirusi-hinako.PNG", name: "やじるしひなこ", sizeScale: 1.0, head: { cx: 0.4, cy: 0.08, r: 0.07 } },
];
