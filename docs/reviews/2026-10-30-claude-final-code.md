# v0.7.1（fd71433）総合再判定（読み取り専用）

## 判定：条件付き承認（前回と同じ）
今回の修正差分に、承認を止める新しい問題は見つかりませんでした。残る条件は、実行中の30分検査 `.dev-data/packaged-acceptance/2026-10-29T18-18-00-322Z-27496/` の結果だけです。未完了なので合格とは扱いません。

## 証拠の区別
- **私が今回読んだもの（静的読取のみ、実行・ビルドはしていません）**
  - 文書：AGENTS、HANDOFF、前回の再レビュー、integrated-validation の最終節、GAME_SPEC:177、TECH_SPEC:45-47
  - コード：`game.ts`、`profile.ts`、`loop.ts`、`platform.ts`、`timing.test.ts`、`en-game.ts`、`items.ts:30`、`i18n.test.ts`、`packaged-check.mjs`
  - 生成物：`release-manifest.json`、final portable の report、短期検査 18-13-44 の report
- **親担当の実行証拠（自己申告で、私は再実行していません）**
  - 536テスト、型検査、lint、Web build
  - cloud-check の実HTTP/SQLite、別クライアントでの復元、DB再起動
  - 旧30分検査の import 比較 FAIL の原因が options の順序だけだったという確認
  - 製品Webでの継続プレイ
  - 「旧方式の分時計では率が6倍に膨らむ」という実際の再現

## 今回の差分の確認
| 項目 | 静的な根拠 | 評価 |
|---|---|---|
| 分時計を1つにまとめた | `game.ts:75-76` で `rates.elapsedMs` だけを進め、Game 側の別時計はなし。`createGame` は時計を0に戻さない | 可 |
| 旧セーブの移行 | `profile.ts:222-227`：`elapsedMs` が無い場合だけ、`current` を `legacyUnmeasuredGain` へ移して0から測り直す。`minutes`、所持金、EXP は変更しない | 可。推定で時間を補わない |
| 壊れた値の拒否 | `profile.ts:220,226,229`：範囲外、型違い、上限超過はエラー。初期値への置き換えはしない | 可。AGENTS:19 に適合 |
| テスト | `timing.test.ts:6-20`：30秒×10回を `validateProfile` とクラウド復元で交互に繰り返し、5件、playMs 300000、合計一致、率＝総額/5 を確認 | 可。欠陥の再現条件を直接押さえている |
| 英語のドロップ文 | `en-game.ts:1634-1635,1657`：改の番号を漢数字か数字に限定し、`」` を巻き込まない。`i18n.test.ts:40-48` はバナー・浮動ラベル・伝説通知・日本語への復帰を確認 | 可。10以上の番号は `Mk 10` になり、`items.ts:30` と矛盾しない |
| 検査ツールの変更 | `packaged-check.mjs:227,229,266`：深い等価比較に変えても比べる値は同じ。`:229` で import 前後の `rates` 一致、`:291` で `elapsedMs` が保存されたことを確認するチェックが新たに加わっている | 可。検査は弱まっていない |
| 配布物 | manifest（checkedAt 18:18:00.222Z）の portable の SHA256 が `4024…c8ac` で、final portable の report と一致。初回・再起動とも exit0、stderr は空 | 可 |

前回評価した領域（体験・テンポ、装備、役割・終盤、演出、日英、保存、保守性）は、今回の差分で悪くなっていません。前回の P2（深淵の中身は繰り返し、遠征録の表示場所、範囲外の項目）はそのまま残ります。

## 新しい指摘（いずれも P2、承認は止めません）
1. **30分検査は実時間との一致を自動では判定しません。** `packaged-check.mjs:185` は playMs を記録するだけです。また `rateMinutes=10` のため、毎分記録の件数は30分後には10件で頭打ちになります。判定の際は report の samples の時刻と playMs を手で比べる必要があります。
2. **街にいる間も分時計が進みます。** `accountElapsed` では playMs だけが街で止まり、`rates.elapsedMs` は進み続けます。そのため街での待機分が収入0の1分として平均に入り、その後の放置報酬が低めに出ます。過大にはならない側なので欠陥ではありませんが、仕様として明記するか、扱いを決めておくべきです。
3. **文書が古いままです。** HANDOFF:16 と integrated-validation:77 は、まだ `3643…` を「最終portable」としています。新しい hash `4024…` は追跡中の文書にはまだありません。最終記録のときに差し替えが必要です。
4. **短期 PASS は最終 build より前のものです。** 18-13-44 の短期 PASS は manifest の時刻 18:18 より前に win-unpacked で実行されています。最終 build での実IPC往復を示すのは、今回の30分検査だけです。

## 承認へ移す条件（18-18-00 の report.json）
- `ok:true`、`errors:[]`、初回・再起動の両 phase が exit0
- `rendererErrors` が0件
- 初回 phase の samples で、playMs の増え方が実時間とほぼ一致する
- 最終的な `rates.minutes` が10件
- `fileImport.earningsIntervalPreserved` と `roundtripPaused` が true
- 異常停止から明示的に復帰した状態がチェックポイントと一致する
- 残っている子プロセスが0（`remainingObservedProcesses` が空）
- 結果と `4024…` の hash を VALIDATION・HANDOFF・resolution に記録し、指摘3を直す

FAIL の場合、または途中で止まった場合は保留に戻します。FAIL の原因が検査ツール側だったとしても、最終 build で取り直すまでは合格扱いにしません。
