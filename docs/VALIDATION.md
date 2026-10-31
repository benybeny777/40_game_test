# ローカル検証記録

## 0.7.4 爽快感（2026-11-01）

[対応・検証詳細](reviews/2026-11-01-action-resolution.md)。型/lint、68ファイル747テスト成功。最後の通知履歴破棄追加後に関連3テスト/lint、Web/Windows build、配布116ファイル検査も成功。ClaudeとCodexのコード統合承認を取得。

右IAB実操作は近接3人のLv1から10分24.95秒、B10・328撃破・ボス2・全滅1。最終描画修正後に再読込して戦闘、375×812、画面移動・停止・保存書き出しを確認。console error/warn 0。全時間が最終描画版ではない。9編成×3seedの60分測定は実画面とは別の証拠。

現行portable v0.7.4: 120,869,399 bytes、SHA256 `dde938aecd3762aefc8f687e3066f11f258a60cb3af49feef5210b129de54264`、NotSigned。新版exe起動は未実施。右画面B10で一時停止、viewport解除、4177のみ表示用に維持。

## 0.7.3 販売品質再審査（2026-11-01）

[対応と実操作の詳細](reviews/2026-11-01-sale-quality-resolution.md)。実Claude CLIは未達→修正→最終コード承認、独立Codexもコード統合を承認。これを全編成・全環境での販売受入完了とは扱わない。

- 型/lint、64ファイル715テスト、Web/Windows build、配布116ファイル検査が成功。高並列時のlint試験timeoutは記録を残し、制限時間を変えず4workerで成功。通常pnpm testも同じ結果。
- 右側IABの製品Webで新規10分10秒、B11・撃破327・大ボス1・全滅0。最終ビルドでは刻印比較/装備/日英技能、100階の第二段階発動と次難度、375px、図鑑12種、保存復元・放置装備数を別途確認。console error/warn 0。
- 10分プレイは最後の比較順/クリック保護修正前、最終ビルドでその変更箇所を再操作した。B100/刻印は検証用条件であり、自然進行の実績と分ける。3seed×240分のシミュレーションでは通常B100突破、全編成や人間の長時間評価は未実施。
- portable v0.7.3: 120,867,559 bytes、SHA256 `8ded2519598008567ca6cfa26a551dc3103048dafa5f1f9be60dbb9aad946b9b`、NotSigned。今回は右IAB指定のため新exeの実起動は未実施。
- 右画面はB11通常セーブ＋放置報酬受取後で一時停止。4177 previewだけ表示用に残し、5177開発サーバーは終了。旧0.7.2 portableを確認後削除。以下は過去版の記録。

## 0.7.1（2026-10-30、最終実機検査PASS）

製品コード `fd71433`。[指摘対応](reviews/2026-10-30-review-resolution.md) と [実操作・測定記録](reviews/2026-10-30-integrated-validation.md) を参照。旧版や修正前の結果を今回の合格へ流用しない。

| 対象 | 確認した結果 |
|---|---|
| 型・lint・単体 | 53ファイル536テスト、typecheck/lint成功。2倍速、分途中の保存時計、旧未計測収入の明示移行、取込、描画、翻訳を含む |
| build・配布 | Windows/Web build成功、release-check116ファイルPASS。未署名。開発用QAは製品に含めない |
| 実時間集計 | 両host実60秒1200tick/playMs60000/1分履歴1件、30秒×10回の保存・再起動・取込で5分5件と実総獲得/5。分時計を保存して過大率を防ぐ |
| 実Web操作 | 新規B1から装備比較装着、控えEXPなし/出撃成長、B10再訪、B30の敗北後の道場・隊列変更でB31へ。日英のJSON確認/取消/復元/不正・容量超過・未来版拒否、破損起動復旧、深淵遠征録375/1280pxを確認 |
| 保存API | 実HTTP/SQLiteで部分時間・収入・旧未計測集計を別clientへ復元し、DB再起動後も一致。競合/未来版/別account分離PASS、専用DB削除済み。serverソース変更なし |
| 自己展開portable | 最新hashで初回・再起動ともexit0、stderr空。playMs0→14950→29950、17人/v3。`.dev-data/portable-launch-0.7.1-final/report.json` |

現行portableは `release/TaskbarHyakkiko-0.7.1-portable.exe`、120,852,608 bytes、SHA256 `40243069d8e8939979b9fa31aa5b0bf10622779b643113c8297dfd511c6ca8ac`。NotSigned。最終30分は `.dev-data/packaged-acceptance/2026-10-29T18-18-00-322Z-27496/report.json` で**PASS**。初回・再起動ともexit0、renderer例外0、残存子0、debugger閉鎖。実行本体SHA256は `7e589ad628ed983ad8fcde474cacb9d5084da3026494659ba55f396310b4a39a`、asarは `59fd620f95061cae49a88590f1482a05bc1df0126776682f92b83fb9676a3ad3`。

初回はB23・757撃破・ボス2・全滅0、playMs1,799,550。最初から最後のsample間で実1,782,121ms、playMs増分1,782,100ms（比0.9999882、非同期取得の差−21ms）。JSONのISO時刻を直接Date.parseして算出した。先行のPowerShell日付→文字列変換ではミリ秒を落としていたため、精密値へ訂正した。毎分履歴は仕様上の上限10件で、30件を保持する設計ではない。初回保存の途中時計59,550msは再起動後にも継続し、街での待機を経て7,300ms・履歴10件になった。初回/再起動の両方で実JSON IPC取込の一時停止・部分時計保持、取消/不正/未来版で保存不変、合成runtime障害時の保存拒否とチェックポイントへ明示復帰がPASS。

親子合計working setは876.4→654.1MiB、private bytesは868.3→472.4MiB、観測1,782秒でCPU累積差401.2秒。共有ページの重複を含む測定であり、全PCでの性能や無期限の漏れなしを保証しない。終了後にTaskbarHyakkiko.exeが残っていないことも別途確認した。

前の30分 `17-41-26-226Z-30692` は最後の取込比較でFAIL。短期 `18-12-54-468Z-32840` のbefore/afterでoptionsのキー順だけが相違と確認し、検査側をJSON文字列比較から厳密深比較へ変更した。同じ条件の短期 `18-13-44-887Z-15536` はPASS。生の失敗記録を変更せず、最新版の30分合格として扱わない。

最終実機結果を読んだ [Claude最終原文](reviews/2026-10-30-claude-integrated-final.md) と [Codex最終判定](reviews/2026-10-30-codex-integrated-final.md) の両方が、`fd71433`のローカル製品範囲を総合承認。条件付き段階からの残条件を解除した。Claudeが指摘した精密時刻と確定記録の更新漏れは反映済み。両担当の静的評価・親の実操作・生の実exe証拠を区別する。

旧0.7.0 portableを新配布の確認後に実パス・非リンク・非使用確認して削除し、120,845,801 bytesを解放。削除後空き454,240,628,736 bytes。IAB全タブとviewport指定、4177/4178/5177/8787 listenerを終了確認済み。既知の自動承認レビューによる削除拒否分は再試行せず未削除。最終試験自身も正常終了し、観測子プロセスが残っていない。

追加で、最終native検証の`data/session`（8,382,493 bytes）と`portable-launch-0.7.1-final/session`（7,238,018 bytes）の削除も自動承認レビューに拒否された。事前に絶対パス・リンクなし・ゲームプロセス終了を確認したが、理由は`blocked by policy`のみ。合計15,620,511 bytesは未削除で、別手段で再試行しない。削除前空き454,281,629,696 bytesを回収後の数値と偽らない。

Steam・実決済・公開・署名・実スマホ・クリーンPC・遠隔クラウド運用は今回の合格範囲に含めない。人間の満足度、全680編成の難易度、無期限の安定性を保証する試験ではない。

## 0.7.0（2026-10-29）

下記を旧版の記録より優先する。レビュー原文・対応表は [reviews](reviews/2026-10-29-review-resolution.md)。Claude CLIの静的評価、コアの高速シミュレーション、実画面、実配布exeを区別する。

| 対象 | 結果と根拠 |
|---|---|
| 型・Lint・単体 | 最終ソースでtypecheck/lint成功、46ファイル470テスト。ボス中断・装備成長・比較・経験値・保存／復元・描画／音声の障害境界を含む |
| 配布・Web | `pnpm dist` / `pnpm web:build`成功、release:check116ファイルPASS。開発専用qa-scene/qa-walkは製品に含めない |
| 実ブラウザー | Codex内IAB、320/375/960px × 日本語／英語 × 8画面。横はみ出しなし、console error 0。実装備の増減・無料reset/全振り/自動振り・交代後の参加者のみ成長・ストア試着を確認。詳細は [UI記録](reviews/2026-10-29-ui-validation.md) |
| フォント・画像 | 同梱BIZ UDPGothicの400/700を製品Web画面で読込確認。パネル画像は戦闘用を除いた6PNG、展開量66→36MiB。これはプロセス全体の使用量ではない |
| ゲーム進行 | 実コア＋実ドロップを使う3seedで通常B100、修羅B100、深淵B101突破。初回通常B100は166.69〜175.64分。深淵の最長約20分の足止めを含め [進行記録](reviews/2026-10-29-progression-validation.md) に記載。人間の実時間プレイや全編成の保証とは異なる |
| 保存API | 最終CloudClient＋別repoの本物HTTP/SQLiteで登録→保存→別client復元→競合拒否→DB再起動→未来版拒否→別account分離PASS。専用tmp削除済み。遠隔HTTPS運用や今回のnative cloud IPCの証明ではない |
| 破損保存 | 終了時の正本／前世代不変・選択後の一時停止は単体試験。実exeの警告／原因／進行喪失／2選択肢はnative AXで確認。ネイティブ撮影・入力はOSアクセス拒否のため、実クリック確認とは扱わない |

最終実exeの30分受入は `.dev-data/packaged-acceptance/2026-10-29T14-19-30-662Z-33660/report.json` で**PASS**。初回・再起動の両phaseでrenderer例外0、観測した残存子プロセス0、終了code0、デバッグport閉鎖。周回OFF・自動装備OFFでB12へ進み、435体撃破・大ボス1体・全滅2回からの立て直しを記録した。17人保持／実出撃3人、日英同期、通常版のsandbox／購入拒否も確認した。

両phaseで合成runtime障害を明示APIから通知し、原因表示・操作／保存retry拒否・保存ファイル不変・チェックポイントと同じ表示への明示リロード・帯とパネルの一時停止がPASS。これは自然発生した障害や全例外経路の実機再現とは区別する。実行本体SHA256は`dd950fa5f6058125511f2aa71b846d5856208b9f3864829ecdda000959832cee`、asarは`01922d2e61d3fa14a6a160a887e948c0db206fffea82b5e39bad911c2ccf3ed6`。

親子合計working setは860.0→654.6MiB、private bytesは762.7→449.2MiB。観測1784.9秒のCPU累積差263.6秒。working setには共有ページの重複があり、専用メモリー量・全PC共通の性能・無期限の漏れなしを保証する数値ではない。

自己展開portable自体もNode `spawn`で環境を明示して起動し、初回15,000msの進行保存→同ファイル再起動後29,900msへ継続、v3／17人保持、両回exit0を確認した。専用データと結果は`.dev-data/portable-launch-2026-10-29/`。自己展開版で30分試験を行ったという意味ではなく、30分は同梱されるwin-unpacked本体で実施した。

先行したPowerShell `Start-Process`経由の試験はexit0でもセーブがなく失敗。原因を追い、`[Environment]::SetEnvironmentVariable(name,$null,'Process')`ではこのPowerShell環境で`ELECTRON_RUN_AS_NODE`が空文字のまま存在していたと確認した。Nodeで存在を確認すると`exists:true`、値は空文字だった。ElectronのNodeモードを検査側が残していたためで、製品コードは変更せず`Remove-Item Env:ELECTRON_RUN_AS_NODE`等で実際に除去した。存在しないことを検査後、同じStart-Processで再試験し、14,900msの進行保存／v3／17人／exit0がPASS。記録は`.dev-data/portable-shell-recheck-2026-10-29/`。単に別の起動方式で失敗を隠したのではなく、同じ方式で原因を解消した。

現行portableは `release/TaskbarHyakkiko-0.7.0-portable.exe`、120,845,801 bytes、SHA256 `a888600241d297baa0c70e3ea63f076209afaab829a6594a5642d81be9815e01`。`Get-AuthenticodeSignature`でNotSigned、未署名。[日本語パネル](images/play-panel.png)・[英語パネル](images/play-panel-en.png)・[帯](images/play-strip.png)は、この実行の実ゲームウィンドウから採取した。

途中版の `2026-10-29T13-43-17-013Z-40680/report.json` は、最終版への置換のため約633秒で検査者が終了させた記録で、`ok:false`。自然発生の不具合や最終PASSへ読み替えない。

自動承認レビューは `.font-tools`（18,005,782 bytes）、フォント変換元TTF2本（計9,310,284 bytes）の削除を拒否した。理由は「blocked by policy」で、詳細は提示されていない。別手段で再試行せず未削除のまま、製品／コミット対象から除外する。以前に拒否されたout/preview等も再試行していない。全残骸の後片付け済みとは扱わない。

追加で `.dev-data/recovery-ui-2026-10-29` の削除も同じ自動承認レビューに拒否された。対象はこの作業で作った合成セーブ／設定／キャッシュで、使用プロセスは終了済み。未削除として保持し、別手段での再試行はしない。

最終確認後、旧0.6.0 portableは実パス・非リンク・非使用を確認して削除（116,421,284 bytes）。自己展開版の一時展開先は起動ランチャーによって削除され、残存ゲームプロセスなし。IAB3タブとviewport指定、5177/4177の検証サーバーも終了した。削除後の空きは455,061,147,648 bytes。最新の検査report／画面と現行配布物は維持する。

実スマホ、クリーンPC、署名・Steam・実決済、外部クラウド運用は本記録の合格範囲ではない。GitHub ActionsはAPIで無効を確認し、検証に使用していない。

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
