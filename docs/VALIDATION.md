# ローカル検証記録

## 0.6.0（2026-10-29）

- 最終変更のtypecheck/lint、30ファイル377テスト成功。初回OS言語、保存一本化とrollback、装備filter、編成反映待ち、modal、strict profile/settings、実非同期storeエラー、歩行phase、全projectile素材を含む。
- 別repoの保存APIはNode24/SQLiteで14テスト成功。ブラウザーを起動せず実HTTPで認証・別account・期限・CAS・再起動・schema保護・巨大/不正JSON・実書込障害を確認。
- `tools/cloud-check.ts --server-root C:/00_PG/40_game_test_server`: 実CloudClientから登録→777小判upload→別client復元→409とrefresh→同SQLite再起動後revision2/777保持→未来版復元拒否/ローカル不変→別account空。結果`ok:true, cleanup:true`。mockfetch試験と区別する。
- Codex内IABで開発用`/qa-walk/`に17人を表示し、全員5frame、輪郭・足・隣コマ切出し・人物差を目視。実ゲームの画像読込/日英設定/クラウド設定を確認。外部Chrome使用は途中で終了し、それ以降は再起動していない。
- Native短期受入の初回はクラウドIPC登録/upload/restore/logout自体は成功したが、起動portrait raceでrenderer例外が出て**FAIL** (`2026-10-29T11-46-13-412Z-34448`)。素材読込gateと復元構築順序を修正し、再build後の実exeで初回/保存/終了/再起動とcloud bridgeがPASS (`2026-10-29T12-05-27-411Z-38340`)。これは停止中の言語再翻訳の最終修正前で、最終artifactはもう一度受入する。FAIL記録を隠さない。
- 実I/O保存障害→停止/alert/retry/設定rollback/quit各選択は`tools/save-failure-check.mjs`で成功。選択dialogのみstub。専用lab/子を終了・削除した。SQLite/TypeScript/Viteの実験的API・config警告は消していない。

最終ソースの再build後、実exe受入は`2026-10-29T12-10-34-475Z-11116/report.json`で**PASS**。初回・保存・終了・再起動の両phaseでrenderer例外0、観測した残存子0。両phaseの実main/preload IPCからアカウント登録→revision1 upload→同じ小判の復元→一時停止→logoutを本物の保存APIへ実行し成功した。これは外部Chromeの試験ではない。

配布物は`release/TaskbarHyakkiko-0.6.0-portable.exe`、116,421,284 bytes、SHA256 `7cfc9149dd304b0f08e22afbfc60ebfab6a17338e881d76e090349ca3cfc8864`。release:check116ファイルPASS、未署名。旧0.5.0/0.5.1/0.5.2 portableは現行への置換を確認して削除した。

Codex内IABで最終の停止中に日英を変更し、canvas ariaが`出撃中：…`→`Deployed: …`へ新しい戦闘frameなしで即更新することも確認し、日本語・通常進行へ戻した。確認用tabを閉じ、5174/8787の検証serverと実exeの終了を確認した。server側`.dev-data/acceptance/`は既知の合成SQLiteだけであること・リンクなし・非使用を検査後に削除。旧portableと合わせて331,931,648 bytesを解放、確認時空き457,708,244,992 bytes。以前に削除拒否されたout/preview等は再試行せず保持しており、全残骸を掃除済みとは扱わない。

運用TLS、アカウント復旧/削除、遠隔端末、コード署名、クリーンPC、新版の30分以上の放置は別の未確認条件。購入/Steam Marketは対象外。以下は旧版の履歴。

## 0.5.1（2026-10-29）

| 対象 | 結果と根拠 |
|---|---|
| 型・Lint・単体 | typecheck/lint成功、24ファイル278テスト。参加者限定EXP、オフライン獲得先の固定、入替待ち、後列近接の射程と前衛死亡時、攻撃動作を含む |
| ビルド・配布 | web:build/dist成功、release:check116ファイルPASS。portable SHA256 `d401372cfb0ac5ec585b79cf5932c04948ece1838b9a1afd5ee849bba18996f0` |
| 実exe | 最終buildの初回起動→保存→終了→再起動PASS、renderer例外0、観測した子プロセスとCDP終了。短期検査であり旧版の30分記録とは別。report `.dev-data/packaged-acceptance/2026-10-28T23-06-51-436Z-33000/report.json` |
| 実Chrome | 375×812・812×375・768×1024、全8タブ。英語残留/横overflowなし、focus/scroll/言語切替/保存reload PASS |
| 背景 | 専用browser save fixtureでB1/6/11を実選択し、地下墓地/市場/禁書庫を撮影・目視。背景ON/OFFの不透明画素率0.939/0.066、元のONへ復帰 |
| 実アクション | サムライ/番長/力士の通常攻撃イベントを3人分観測。実canvasを0/45/90/135/190/250/330/430msで撮影し、踏込・命中・帰位を目視。`tools/action-preview.pw.txt`、画像`images/action-frames.png` |
| 保存障害 | `node tools/save-failure-check.mjs`成功。専用実I/O失敗/retry、settings rollback、起動race。dialog選択のみstub。user saveは未変更 |
| 進行sim | 変更後120分の高速core sim: B32、出撃Lv16/16/16、控え全員Lv1、1110撃破、全滅0。実時間のプレイ実績ではない |

画像: [地下墓地](images/background-catacombs.png)・[地下市場](images/background-market.png)・[禁書庫](images/background-archive.png)・[実戦アクション](images/action-frames.png)。素材生成は画像生成ツール、検証画像は実際の描画から採取。ブラウザーのCanvas読み戻し性能warningは検証用getImageData由来で、ゲーム例外とは区別する。

以下は旧版の履歴。0.5.1で同じ長時間/全画面/クリーンPC受入を行った証拠にはしない。

## 0.5.0 ローカル検証記録

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
