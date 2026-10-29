# 素材・表示の出典

更新：2026-10-29。現行採用素材と初期制作の記録を分ける。制作・採用の記録であり、商用の権利調査・最終監修の完了を示すものではない。[IP制作管理](IP.md)も参照。

## 現行のキャラクター・敵

本作用に組み込みimage_genで生成・編集した透過PNGを使用する。2026-10-29の制作記録と生成指示全文は[素材の生成指示](../assets/sprites/art/PROMPTS.md)。AIを利用した素材であり、手描きと称して販売しない。原本・採用画像・ゲーム上の切り出しと描画処理を区別する。

| 採用PNG | 人物・敵 | コマ構成 |
|---|---|---|
| `assets/sprites/art/party-atlas.png` | サムライ、忍者、地雷系、オタク、パチプロ | 5列×4姿 |
| `assets/sprites/art/party-extra-a.png` | 巫女、番長、ギャル、スケバン、農民 | 5列×4姿 |
| `assets/sprites/art/party-extra-b.png` | メイド、キョンシー、ホームレス、力士、シスター | 5列×4姿 |
| `assets/sprites/art/tono.png` | 殿 | 2列×2姿 |
| `assets/sprites/art/gariben.png` | ガリ勉 | 2列×2姿 |
| `assets/sprites/art/party-walk-a.png` | サムライ、忍者、地雷系、オタク、パチプロ | 5列×5行、歩行専用 |
| `assets/sprites/art/party-walk-b.png` | 巫女、番長、ギャル、スケバン、農民 | 5列×5行、歩行専用 |
| `assets/sprites/art/party-walk-c.png` | メイド、キョンシー、ホームレス、力士、シスター、殿、ガリ勉 | 7列×5行、歩行専用 |
| `assets/sprites/art/enemy-atlas.png` | 提灯お化け、河童、鬼火、大鬼、唐傘おばけ、化け猫、招き猫もどき、招き猫大将、バグ精霊、ポップアップ鬼、呪いのフィギュア、電脳九尾 | 4列×3段、各敵の待機1姿 |
| `assets/sprites/art/enemy-attack.png` | 上記と同じ12種。元の敵との輪郭・装飾・色の対応を保つ攻撃キー | 4列×3段、各敵の攻撃1姿 |

味方の基本素材5枚に、歩行専用3枚を追加した。敵12種は待機12姿と攻撃12姿の計2枚、背景はPNG1枚に3区域分。基本素材の4姿は待機・左足歩行・攻撃・右足歩行の制作履歴を保持し、現在の歩行には専用素材を使う。敵は待機／攻撃キーを切り替え、種類別の移動・浮遊・構え・体の動き・被弾・消滅を描画コードで加える。分裂した精霊と九尾の幻影は元の敵を縮小・半透明化して再利用し、独立した新規原画があるとは数えない。

歩行の制作指示は[WALK_PROMPTS](../assets/sprites/art/WALK_PROMPTS.md)。生成原本は同じ会話の`generated_images`内の`exec-d5836cbf-af8b-45ad-85a2-f21e1d64ae3e.png`（A）、`exec-8bd33656-ba02-4e9c-abfc-67b1846998ab.png`（B）、`exec-e6ed7a2c-11b9-4d23-92cf-20566e8708d1.png`（C）。既存の5枚を人物参照として再生成し、採用PNGをworkspaceへコピーした。

`enemy-attack.png`も本プロジェクト用にimage_genで生成した画像で、`enemy-atlas.png`の敵と同じ存在として攻撃姿を対応させる。攻撃キーの新規画像と、コードによる体の動きは別の制作物として記録する。生成・採用の記録は[素材の生成指示](../assets/sprites/art/PROMPTS.md)を参照する。

今回の編集には、農民を細く弱々しくする、老人を汚れた痩せた人物と胴の箱一つにする、メイドをアキバ風にする、シスターを白い長いヴェールと青い長衣にする、殿とガリ勉を独自の人物へする、敵12種の絵を粗いドットの方向へ刷新する指示を含む。指示に書いた画風・色数・構成がそのまま完全達成された、と自動的には扱わず、採用画像と実画面で監修する。

ジョブと素材の対応は`src/shared/art.ts`、人物IDの対応は`src/shared/characters.ts`、実行時の透過輪郭・セル境界・整数倍率処理は`src/renderer/strip/sprites/art.ts`。生成指示の「手作りらしい見た目」は画風の要求で、実際に人が全ピクセルを手描きしたという制作方法の主張ではない。既存作品の画像や実在ブランドを参照入力していないという記録も、類似性調査済みという意味にはしない。

## v0.5.1のダンジョン背景と動作

`assets/sprites/art/dungeon-backgrounds.png`は、本プロジェクト用に組み込みimage_genで生成した地下墓地・朽ちた商街・禁術の書庫の3種の背景原本。指示と生成記録は[素材の生成指示](../assets/sprites/art/PROMPTS.md)に保存する。手描き素材や外部ゲームから取得した背景とは記さず、人物・敵の原画とも分けて管理する。商用の権利調査や最終監修の完了をこの記録だけで保証しない。

区域の切り替え、床位置の正規化、壁と床の歩行パララックス、Windowsの戦闘部分に限定した表示、スマホ戦闘面の全幅表示は本プロジェクトのCanvas処理による。「背景と地面を表示」をOFFにしたWindowsの透過表示も同じ描画設定で管理する。

ジョブごとの踏み込み・斬撃・突き・掌打・投擲・跳躍などの差、後列近接の敵前へのダッシュと元位置への復帰、命中の短い停止・閃光・反動・火花は、本プロジェクトの描画コードがスプライトへ付加する。攻撃演出の変位は描画コードによるもので、別途生成した歩行専用の全身原画や敵の攻撃キー画像と区別する。v0.5.1の歩行1.2秒・ウェーブ終了待ち0.3秒・階層クリア待ち0.8秒・構え0.1秒・味方間隔0.5倍・弾速360ドット/秒の調整はゲームロジックによる。具体的な旧値・実装の正本は[技術仕様](TECH_SPEC.md)、実際の新版画面・動作の確認結果はHANDOFF／VALIDATIONを参照する。

## UI・アイコン・フォント

- 管理画面・戦闘帯・スマホ入口は本プロジェクトのHTML/CSS・Canvasによる表示。BIZ UDPGothic Regular/BoldをWOFF2で同梱し、OSの日本語フォントに依存しない。共通定義は`src/renderer/font.css`。初期設計のDotGothic16同梱案は現行採用ではない。
- Windowsトレイの16×16ピクセル図形は本プロジェクトで作成し、`src/main/index.ts`から生成。
- exeアイコンは現行`party-atlas.png`のサムライから`tools/make-icon.ts`で切り出し・縮小して生成。別の手描きイラストや外部アイコン素材とは記さない。
- 32色パレット`assets/palettes/base32.txt`と、3×5ドット文字の基礎`src/renderer/strip/font.ts`は本プロジェクトで作成。日本語のオーバーレイも同梱BIZ UDPGothicを使用する。
- 効果音・音楽・音声は現行製品へ同梱していない。

### 同梱ゴシックのライセンスと取得元

- Copyright 2022 The BIZ UDGothic Project Authors。モリサワの[公式公開リポジトリ](https://github.com/googlefonts/morisawa-biz-ud-gothic)より、固定commit `18934af56b9c003ca58c54bffbf226848cb11032` の `fonts/ttf/BIZUDPGothic-Regular.ttf` / `BIZUDPGothic-Bold.ttf` を取得。
- ライセンスは[SIL Open Font License 1.1](../assets/fonts/OFL.txt)。著作権表示を含む公式原文を変更せず同梱し、ゲームの「あそびかた」末尾から全文を読める。
- FontToolsで全字形のままWOFF2へ圧縮。サブセット化・輪郭改変・名称改変なし。配布用WOFF2と[再現手順](../assets/fonts/README.md)を保持。再取得可能な変換入力TTF・一時変換環境の削除は自動承認レビューに拒否され、未削除（製品からは参照しない）。外部Webフォント配信やOSへのインストールは不要。

## 実画面と過去の参考画像

READMEで使う`docs/images/play-strip.png`、`play-panel.png`、`play-gear.png`は、ゲーム自身のウィンドウを撮影する実画面用の保存先。最新版への差し替えと確認結果は[HANDOFF](../HANDOFF.md)で管理する。別アプリやデスクトップの内容を含めず、撮影していない状態を実装済み画面と称しない。

初期資料の`docs/images/game-concept.png`は2026-10-20にimage_genで生成した構想画像で、実装画面や現在のゲーム用スプライトではない。生成指示は`docs/images/game-concept-prompt.txt`。初期のM0スクリーンショットとクリック透過検証画像も、当時の状態を記録したものとして扱う。

`assets/sprites/src/*.sprite.txt`は2026-10-22の文字配列形式の初期素材。現在の人物・敵の採用PNGとは別物で、弾・小物などの描画に残る素材もある。初期素材の制作方法を現行PNGの出典へ流用しない。
