# Windows配布とSteam公開の準備

更新：2026-10-29。すべてローカルで検証する。GitHub Actionsは使用しない。

## 配布物を作る

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm dist
pnpm release:check
```

`package.json` の版と `build` 設定を正本とし、`release/` へWindows x64のportable exeと`win-unpacked/`を生成する。Node.jsやpnpmは開発用で、利用者PCへ別途導入させない。アイコンは現行のゲーム用`party-atlas.png`のサムライを切り出して生成する。

現行バージョンは0.5.0。portableのファイル名は`TaskbarHyakkiko-0.5.0-portable.exe`。初回の配布構成確認後にもソースを変更した場合、最終検証時に必ず`pnpm dist`と`pnpm release:check`を再実行し、古いexeの検査結果を新版の根拠へ使わない。

`release-check.mjs`はアプリ本体のPE/x64形式、portable起動部のWindows PE形式、実asar内の起動ファイル、開発用セーブ・ソース・SteamテストAppID・秘密鍵の混入、既知のAPIキー形式、Windowsのkoffiネイティブモジュールを確認し、配布ファイルのサイズとSHA-256を`release/release-manifest.json`へ出力する。NSISのportable起動部はx86でも、中に入るアプリ本体とkoffiはx64であるため、二つを別々に判定する。既知形式の検査であり、秘密情報がないことを完全に証明するものではない。SteamCMDや外部サービスは起動しない。

ブラウザー版は`pnpm web:build`で別の`dist/web/`へ出力する。Windows portableへWeb配布フォルダーを同梱しない。起動・LAN内のスマホ確認・保存の分離は[MOBILE](MOBILE.md)参照。Webファイルの生成と、公開サイトへのアップロード／実端末の受入は別の作業。

## 受入を分けて記録する

ファイル検査のPASSだけで販売可能とは扱わない。以下を別々に記録する。

| 項目 | 確認内容 |
|---|---|
| 開発検査 | 型・lint・コアテスト・rendererビルド |
| 配布ファイル | portable生成、PE/x64・asar検査、SHA-256 |
| 配布exeの実機操作 | 起動、帯表示、全タブ、セーブ、再起動、正常終了、子プロセス消滅 |
| クリーンWindows | 開発用Node/pnpmのない利用者環境、初回起動、DPI、タスクバーと複数画面 |
| 長時間 | CPU・メモリ・スリープ復帰、30分以上の連続運転 |
| 署名 | 有効な発行元署名、SmartScreenでの実際の挙動。証明書未取得のビルドは未署名と明記 |
| Steam | 正式AppID/DepotID、Steamクライアントからの起動・終了・所有権、審査、ストア素材 |
| 有料商品 | 課金確認、キャンセル、回線切断、再起動後の権利復元、二重処理防止 |

自動検証のセーブは`src/main/paths.ts`で決めた検証用パスへ隔離し、通常の開発用・利用者用セーブへ書き込まない。`GAME_DATA_DIR`の環境変数を使う場合も既存の利用者フォルダを指定しない。

## 実exeのローカル受入

`node tools/packaged-check.mjs --minutes 0.25 --label intermediate`は、開発Electronやソースmainの再読込ではなく、`release/win-unpacked/TaskbarHyakkiko.exe`そのものを起動する。短期の初回・再起動を合わせた予備確認用。最終ビルドの30分試験は`node tools/packaged-check.mjs --minutes 30 --label final`。`final`は記録用ラベルであり、署名・クリーンPC・販売の合格を付与するものではない。

保存先は実行ごとに`.dev-data/packaged-acceptance/<日時>/data`へ固定し、利用者のAppDataへ書き込まない。GAME_PROFILE=user、GAME_STORE_SANDBOX=1で梱包版のsandbox拒否を確認し、GAME_SPEEDと開発rendererの環境変数は除去する。GAME_SMOKE_QUIT_MSによって通常の終了・保存経路を通る。

未使用portを取得して127.0.0.1へCDPを開き、自分が起動したゲームのfile URLのstrip/panelだけへ接続する。17人／3出撃、購入不可・Market無効、en/ja設定同期、街帰還とglobal pauseの区別、通常終了のコードと保存、再起動後の街・設定・周回・言語復元を確認する。ネイティブトレイの一時停止操作はShellApiから実行できないため、このツールで操作済みとは扱わない。

15秒間隔で実exe親子のCPU累積時間・working set・private bytes・handlesを記録し、JSONレポート、stdout/stderr、ゲームウィンドウのみのPNGを実行フォルダーへ残す。CDPと起動したプロセスを終了し、port閉鎖を確認する。異常時の強制終了は失敗として記録する。CPU・メモリーの記録は測定値で、漏れや性能目標を自動判定する基準にはしない。スリープ、DPI、全画面、クリーンPC、署名、Steamは別途検証する。

## セーブ保護の実装

- 現在のセーブをどかさず、fsync済み一時ファイルから置換する。前世代も一時ファイルから原子的に更新する。
- 未対応の未来版セーブが正本・前世代・書込み途中ファイルにある場合、古いビルドは上書きせず`FutureSaveVersionError`で起動／保存を拒否する。
- 壊れた正本から有効な前世代へ復旧した場合、壊れたファイルを`brokenSave`へ保存する。有効な前世代を壊れた正本でローテーションしない。
- 既存の壊れたファイルをさらに別の破損で上書きしない。両世代が読めない場合も新規セーブへ自動リセットせず`SaveRecoveryRequiredError`で停止する。
- 新しいビルドによる旧セーブの移行と、古いビルドへのダウングレードは別の操作として扱う。

## SteamPipeの準備

`steam/build_app.vdf`と`steam/depot_windows.vdf`はテンプレート。AppIDとDepotIDは`__APP_ID__` / `__DEPOT_ID__`のままなので、そのまま送信に使えない。現在は`Preview=1`、`SetLive`空欄。SteamPipeのPreviewはログとマニフェストだけを作り、アップロードしない。[Steam公式：Uploading to Steam](https://partner.steamgames.com/doc/sdk/uploading)

登録後に利用者が正式IDを割り当て、アカウント権限・ビルド対象・デポ構成を確認する。Steamへ入れる内容はportableの自己展開exeではなく`win-unpacked/`のアプリ本体。実アップロード、公開ブランチの反映、正式ストア公開は利用者の指示を受けてから行う。

## この環境だけでは完了しない事項

Steamworksの契約・本人確認・銀行／税務情報・登録費用、正式AppIDとDepotID、署名証明書、ストア／ゲームビルドの審査、Steam Inventory/Marketの利用条件とサービス設定、実購入の受入は未完了。ゲーム内ストアのsandbox成功は実決済成功の証拠ではない。ゲーム本体の品質、素材の権利・生成AIの利用申告、問い合わせ先、プライバシー方針、販売説明も公開前に確認する。

ゲームの仕様は[GAME_SPEC](GAME_SPEC.md)、データと実装の仕様は[TECH_SPEC](TECH_SPEC.md)、最終の実行結果は[HANDOFF](../HANDOFF.md)を正本とする。
