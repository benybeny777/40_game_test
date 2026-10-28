# 0.5.0 ローカル検証記録

2026-10-29、Windows 11 / 表示倍率150%。すべてローカルで実施し、GitHub Actionsは無効のまま。実データと検証用セーブを分離した。

| 対象 | 結果と根拠 |
|---|---|
| 型・Lint・単体 | `pnpm typecheck` / `pnpm lint` / `pnpm test` 成功、21ファイル258テスト |
| ビルド | `pnpm build` / `pnpm web:build` / `pnpm dist` 成功 |
| 配布物 | `pnpm release:check`、116ファイルPASS。Windows x64本体、NSIS起動部はx86、未署名 |
| 実Electron | `pnpm test:shell`、表示・非表示・停止・再開・パネル開閉・正常終了PASS。MenuItem経由で、通知領域の実マウス操作とは区別 |
| 実画面 | `--visual`、29シート読込、3人出撃/14人控え、8タブ、入替・role filter、640DIP横overflowなし。17人と12敵の切り出しを目視 |
| ブラウザー | 実Chromeで375×812、812×375、768×1024の全8タブ。英語残留、横overflow、描画領域、フォーカス、タブ別縦scroll/nav横scroll保持、言語変更と保存reloadがPASS |
| 操作 | 実Chromeで手動+1、無料reset、自動配分、3人交代、街帰還/探索再開、外観試着、実購入不可を確認 |
| 階層 | 専用fixtureで深淵B101→105、表示件数13以下、通常/修羅の100階上限を確認。fixtureを実時間の踏破実績とは扱わない |
| 全画面 | 専用fixtureをComputer Useで前面にし、Win32同一handleで3840×2160→通常window復帰、帯の自動非表示/再表示PASS |
| 保存失敗 | `node tools/save-failure-check.mjs`。実I/O障害→停止/可視alert/retry/export→再保存と実行復帰、元の手動pause保持、settings失敗のlocale rollback、終了の戻る/書出/破棄を確認。終了dialog選択だけstub |
| 起動競合 | artworkの初期読込中に届いた保存障害が、古い初期snapshotで消えるraceを実障害試験で再現・修正し、同じ経路でPASS |
| 実exe | 実`win-unpacked/TaskbarHyakkiko.exe`を隔離userで起動。17人/3出撃、ja/en同期、packaged sandbox拒否、購入/Market不可、town/設定保存と再起動復元、終了code0、子プロセス/デバッグport終了を確認 |

## 30分連続実行

実exeで30分戦闘し、383体撃破。例外0、保存・通常終了・再起動を含めPASS。親子合計のworking setは最初776.5MiB、最後584.4MiB、private bytesは720.1→385.4MiB。CPU累積差207.6秒 / 観測間隔1780.6秒。working setの合計には共有ページの重複があり、この数値を専用メモリー量や全PC共通の性能保証とは扱わない。

30分実行はタブ別scroll/CSS/初期snapshot競合の修正前ビルド。戦闘・保存コアは同じだが、最終exeそのものを30分回した証拠とは区別する。修正を含む最終exeでは起動・表示・保存・再起動の短期受入を再実施した。

ローカルの詳細reportは `.dev-data/packaged-acceptance/2026-10-28T18-55-39-460Z-40964/report.json`。検査ツールは実exeへloopback CDPで接続し、開発用Electronやsource mainへ置き換えない。通常製品でCDPサーバーを起動する設定は追加していない。

## 現行配布物

`release/TaskbarHyakkiko-0.5.0-portable.exe`：108,266,586 bytes。

SHA-256: `8ef1349fc01d6fe01d690eb20c7b301622ebbf5bcaa30cf5c91f69b4c7324f87`

実行本体のSHA-256: `a9c3c53a2a06649139666da4f1bd81e1e44c27c370709c48d437aaa7576f7042`

asarのSHA-256: `01194b319908408e7fbcd8f57fc7887e4cf50a888d302335f0d12b6f9bc26ffe`

配布全ファイルの一覧は`release/release-manifest.json`。配布物と検証用データはGitに含めず、ソース・採用素材・画面・仕様をコミットする。

## 確認していない範囲

別モニター/100%表示、クリーンPC、実スマホSafari/Chrome、長期の電池消費/スリープ、通知領域アイコンの実マウス操作、正式署名、Steam契約・審査・実決済・実Marketは未確認。外部手続きは今回の実行範囲外。全環境での動作を保証したり、販売公開済みと説明しない。

素材・人名の商用最終監修は[IP](IP.md)、未接続部分は[COMMERCE](COMMERCE.md)、再現コマンドは[RELEASE](RELEASE.md)、作業後の残存物は[HANDOFF](../HANDOFF.md)を参照。
