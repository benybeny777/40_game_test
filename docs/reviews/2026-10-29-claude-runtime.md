# レビュー結果：main例外時の保存継続／起動時offline報酬消失の修正確認

**テストは実行していません。** ファイルを読んだだけです（編集・コマンド実行・ブラウザー起動はしていません）。対象は指定の5ファイルに限っています。

## 前回指摘の確認

**1. main例外のあとも保存が続く件 → 解決済み**
- `GameHost.attempt`（`src/main/loop.ts:74-85`）で `failure` が一度記録されると、`saveNow`、`command`、`poll` はすべて先頭で止まります（`:72`, `:75`）。
- `attempt` が入れ子になっても（`command` の中で `frame()`、`saveNow()` を呼ぶ場合）、`failed` は `if (!this.failure)` があるので1回しか呼ばれません。
- `saveNow` が内側で失敗したときも、`:69` で command が成功扱いにならず、失敗が返ります。
- main側でも二重に止めています。`save` コールバックは `state.runtimeError` を見て保存しません（`src/main/index.ts:230`）。終了時の `save` も runtimeError のときは書き込みません（`:403`）。

**2. 起動時のoffline報酬が消える件 → 解決済み**
- `prepareInitialProfile` で報酬を加えたプロファイルを、最初の保存より前に `savedCheckpoint` に入れています（`index.ts:221-223`）。
- そのため、最初のディスク書き込みが失敗したあとに runtime 例外が起きても、復旧時には報酬が残ります。
- 起動処理の途中で例外が起きて `app.exit(1)` になった場合も、ディスク上の `savedAt` は変わらないので、次回起動時に報酬が計算し直されます。

**3. 復旧失敗と二重callback → 問題なし**
- `recoverPreparedProfile` の中で `frame` が失敗した場合：
  - `host.failure` はもう一度記録されます。
  - `stopRuntime` は、`state.runtimeError` がまだ残っているので何もせず戻ります。
  - `reportError` を出したあと、runtimeError を残したまま中断します。
  - 状態に食い違いはなく、もう一度押せば再試行できます。
- 読み直しの要求が2回届いても、2回目は `!state.runtimeError` で捨てられます（`index.ts:312`）。

## 残っている指摘

### [中] スリープから戻ったときのoffline報酬が保存されず、復旧で消える
- **場所:** `src/main/loop.ts:95-98`
- **原因:** 60秒以上の空白を検出すると、`addOffline` で報酬をメモリ上のプロファイルに加えますが、保存せずに `return` します。
- **再現する経路:**
  1. スリープや休止状態から復帰し、`poll` が報酬を加えます。
  2. 次の約100ms（`accumulated` が `tickMs` に届くまで `steps=0` で `:110` から戻り続けます）の間、保存は一度も行われません。
  3. 最初にtickが進む `poll` で `advance()` や `snapshot()` が例外を出すと、`:113` の保存より前に停止します。`callbacks.offline` の `displayBalloon` が例外を出した場合も同じで、報酬を加えた直後に停止します。
  4. 「一時停止で読み直す」を押すと `savedCheckpoint`（報酬が入る前の状態）から再開します。
- **結果:** スリープ中の数時間分の報酬が消えます。ディスクの `savedAt` も更新されないため、次回起動時に計算し直されることもありません。前回直した起動時の経路と同じ種類の問題が、スリープ復帰の経路に残っています。
- **修正案:** `addOffline` の直後、`callbacks.offline` より前に `this.saveNow()` を呼びます。

### [低] runtime停止中に終わったクラウド復元が、失敗と報告されたままディスクを上書きする
- **場所:** `src/main/index.ts:236-244`
- **原因:** `restoreProfile` は `storageError`、`quitting`、`handlingQuit` しか見ておらず、`state.runtimeError` を確認していません。
- **前提:** 対象外の `CloudClient` が、通信を待ったあとに `restoreProfile` を呼ぶこと。読んでいないので未確認です。
- **再現する経路:**
  1. クラウド復元を始めます。`cloudCommand` の開始時点ではまだ runtimeError ではありません。
  2. 通信中に host 側で例外が起き、`host.failure` が記録されます。
  3. 応答が返ると、`persistence.save(prepared.profile)` が成功し、ディスクと `savedCheckpoint` がクラウドのデータCになります。
  4. 続く `host.replacePreparedProfile` は `failure` があるので例外を投げ、利用者には「復元失敗」と表示されます。
- **結果:** 利用者はローカルの保存Aが無事だと考えて「保存せず終了」を選べますが、実際にはAはもうCで上書きされています。停止後は保存を上書きしないという約束（`:404` の文言）にも反します。
- **修正案:** `restoreProfile` の最初の確認に `state.runtimeError` を加えます。

## テストの不足
`tests/native-runtime.test.ts` は `GameHost` を単体で動かして、checkpoint を手で作っています。`index.ts` の `savedCheckpoint` の受け渡し（`:209`, `:223`, `:313`）は検証していません。また、上の2件（スリープ空白の経路と、停止中の復元）を確かめるテストもありません。

`src/renderer/platform.ts` と `src/renderer/runtimeFailure.ts` には、今回の観点で再現経路のある問題は見つかりませんでした。
