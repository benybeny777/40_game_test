# 素材の出典

- M0のトレイアイコン：本プロジェクトで作成した16×16のドット図形。`src/main/index.ts` のピクセル定義から生成。
- M0の帯・管理パネル：本プロジェクト独自のHTML/CSSとCanvasによる仮表示。
- フォント：M0はWindowsのシステムフォントを参照。フォントファイルは同梱していない。設計書のDotGothic16同梱は、正式な表示を整える段階でライセンスとともに追加する。
- READMEの画面イメージ：2026-10-20にローカルで起動したM0の帯のスクリーンショット。背後のアプリの内容を含めない範囲へ切り抜き。
- READMEの完成イメージ（`images/game-concept.png`）：2026-10-20、組み込みimage_genで本プロジェクトの設計をもとにAI生成。実装済み画面や実際のゲーム用スプライトではない。生成指示は`images/game-concept-prompt.txt`に記録。
- M0の透過クリック確認（`images/m0-click-through.png`）：2026-10-20のWindows実画面。別プロセスの検証アプリでクリック回数が1になった状態。ブラウザーや利用者の資料は含めていない。
- キャラ・敵・弾のドット絵（`assets/sprites/src/*.sprite.txt`）：2026-10-22、本プロジェクトでテキストの文字配列として手書きした独自の絵。`docs/images/game-concept.png` の雰囲気を参考にしたが、画像からの変換やトレースではない。
- 32色パレット（`assets/palettes/base32.txt`）と3×5ドット文字（`src/renderer/strip/font.ts`）：本プロジェクトで作成。
- 現行の5ジョブ・妖怪12体（`assets/sprites/art/{party-atlas,enemy-atlas}.png`）：2026-10-27、組み込みimage_genで本プロジェクト用に生成したオリジナルの透過PNG。生成指示の全文は `assets/sprites/art/PROMPTS.md`。管理画面は立ち絵、帯は待機／歩行／攻撃のコマに切り出して使用。妖怪は静止コマに移動・浮遊・被弾・消滅の描画を加える。外部の既存ゲーム素材や実在ブランドは使用していない。
- READMEの現行実画面（`images/play-strip.png`、`images/play-panel.png`、`images/play-gear.png`）：2026-10-27、`tools/visual-check.cjs` でゲーム自身のウィンドウだけを `capturePage` で撮影。他のアプリやデスクトップは含まない。
