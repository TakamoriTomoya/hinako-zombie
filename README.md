# ゾンビひなこシューティング

夜の町で、ゾンビになって歩いてくるひなこを銃で撃って倒す一人称ガンシューティング。
[ひなこシューティング](https://github.com/TakamoriTomoya/hinako-shooting) の写真・音・画面のしくみを元にしている。

あそぶ: https://hinako-zombie.vercel.app
(`main` に push すると Vercel に自動でデプロイされる)

```sh
npm install
npm run dev    # 開発サーバー
npm run build  # 本番ビルド(dist/)
npm test       # テスト
npm run lint
```

## あそびかた

- ゾンビを タップ / クリック して撃つ。頭に当てるとふつうのゾンビは一発
- 弾は8発。なくなると自動でリロード。「リロード」ボタン・右クリック・R キーでいつでもリロードできる
- ゾンビが目の前まで来ると、赤く光って「!!」が出たあとにかじられる(ライフ -1)。その前に倒す
- 全3ステージ(住宅街 → 商店街 → 駅前)。各ステージの最後に「でかゾンビひなこ」が来る
  - ボスはがれきを投げてくる。撃ち落とせる
  - ときどき突進してくる。突進中にたくさん当てると、ひるんで下がる

## 音楽について

BGM・ジングルは SketchyLogic さんの [NES Shooter Music (5 tracks, 3 jingles)](https://opengameart.org/content/nes-shooter-music-5-tracks-3-jingles)（CC0）を使っています。
効果音はコードで合成しています（`src/lib/sound.ts`）。

## 写真について

このリポジトリの写真（`public/images/` など）は実在の人物を撮影したものです。
写真の著作権・肖像権は撮影者と被写体本人にあります。
このゲームで遊ぶ以外の目的での利用・転載・加工・再配布はしないでください。
