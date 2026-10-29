## 結論

指定の4ファイルを読んだ範囲では、どちらの件も解決しています。**再現できる残存不具合は見つかりませんでした。**

## 1. sleep 復帰時の offline 報酬を通知前に保存しない件 → 解決

- **保存順:** `src/main/loop.ts:110-114` で `addOffline` → `saveNow('offline')` → `callbacks.offline` / `viewChanged` の順になりました。通知が例外を投げた時点で、報酬はもうディスクに書かれています。
- **checkpoint:** `src/main/index.ts:233` は、`reason === 'offline'` なら書き込みの前に `savedCheckpoint` を更新します。書き込みに成功すれば、`src/main/index.ts:209` で同じ内容がもう一度入ります。そのため通知中に runtime が止まっても、`reloadAfterRuntimeError` で報酬入りの状態に戻せます。
- **保存失敗時:**
  - `saveNow` が false を返すと一時停止し、通知せずに戻ります（`src/main/loop.ts:82`, `:113`）。
  - ディスク上の `savedAt` が古いままなら、次回起動時に同じ額が計算し直されます（`tests/native-runtime.test.ts:109`）。
  - 停止中にディスクが新しくならないので、「保存せず終了」しても二重払いも報酬の消失も起きません。
- **runtimeError 中:** 保存は拒否され、checkpoint も更新されません（`src/main/index.ts:230`）。

## 2. 通信中に runtime が止まった後の restore がディスクを書き換える件 → 解決

- **入口の guard:** `src/main/index.ts:241` は、`restoreProfile` が実行される時点で `state.runtimeError` / `storageError` / `quitting` / `handlingQuit` を確認します。renderer から報告された停止（`stopRuntime` だけで `host.failure` が立たないケース）もここで防げます。
- **commit 時の guard:** `commitPreparedProfile`（`src/main/loop.ts:59-64`）は、`persist()` の前に `host.failure` を確認します。`failed` → `stopRuntime` は同期で呼ばれるので、2つの guard の判定がずれる時間はありません。
- **書き込み後の差し替え失敗:** 書き込みに成功した後で `replacePreparedProfile` の通知が例外を投げても、ディスク・`savedCheckpoint`（`src/main/index.ts:209`）・`host.game` はどれも同じ remote profile です。復旧しても整合性は保たれます。

## 実行・確認していない範囲

- **未実行:** テスト・ビルド・アプリ起動・ブラウザー操作はしていません。上の結論はコードを読んだうえでの判断で、テストが通るかどうかは確かめていません。
- **未読のファイル:** 指定どおり、`AGENTS.md`、`saveStore.ts`、`persistence.ts`、`cloudClient.ts`、`cloudProfile.ts` は読んでいません。そのため次の3点は前提のまま確認できていません。
  - `saveProfile` が、書き込みに失敗したときに引数の `savedAt` を書き換えないこと。
  - `CloudClient` が通信の応答後に `restoreProfile` を同期で呼び、その間に別の非同期処理を挟まないこと。
  - `PersistenceGuard.save` の失敗時の戻り値と、エラーを通知する順序。
- **テストで確かめていない経路（不具合ではありません）:**
  - `native-runtime.test.ts` の sleep テストは save callback を mock にしています。そのため `index.ts:233` の checkpoint 更新は直接は確かめていません。
  - `tests/native-runtime.test.ts:116` が扱っているのは `host.failure` による停止だけです。renderer が報告した `runtimeError` 中の restore を拒否する入口 guard（`index.ts:241`）にはテストがありません。
