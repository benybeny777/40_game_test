# 最終総合判定：承認（fd71433）

前回の残条件は最終Windows実exe（ネイティブ）の30分検査の結果だけでした。report.json の値が条件をすべて満たし、manifest と final portable の report とも食い違いはありません。承認を止める問題は見つかりませんでした。ただし、検証文書の数値1か所と記録の更新漏れ2件は直す必要があります（下記の「残る非阻害事項」）。

## 私が自分で読んで確認したもの（静的読取のみ・再実行なし）
**30分検査の report**（`.dev-data/packaged-acceptance/2026-10-29T18-18-00-322Z-27496/report.json`）
- 全体：`ok:true`、`errors:[]`
- 実行本体とasarのSHA256は manifest と一致（`7e58…a39a` / `59fd…a3ad3`）
- 初回・再起動の両phase：exit 0（signal null）、`rendererErrors:[]`（指定の「renderErrors」は実際のキー名が `rendererErrors`）、`remainingObservedProcesses:[]`、`cleanedRemaining:[]`、`debuggerClosed:true`
- 両phaseの取込確認：`fileImport` は real-native-ipc で、`roundtripPaused`、`earningsIntervalPreserved`、`cancelledAndInvalidUnchanged` がすべてtrue。取消・不正・未来版はすべて原因付きで拒否
- 両phaseの異常復帰：`runtimeRecovery` で `viewMatchesCheckpoint`、`reloadPaused`、`stripReloadPaused`、`saveUnchanged` がtrue
- 初回の結果：B23、757撃破、ボス2、全滅0、保存playMs 1,799,550
- 毎分の収入記録（`minutes`）は10件で頭打ち
- 分途中の継続：初回は current 202/184、elapsedMs 59,550。再起動後は分が締まって202/184が履歴の末尾に入り、current 0/0、elapsedMs 7,300（街にいる間の時間）。分時計が再起動をまたいで続いていることと合います
- `stderrTail` にある例外は、意図的に入れた不正JSON・未来版・合成障害のログだけです

**配布物と portable**
- manifest：portable は 120,852,608 bytes、SHA256 `4024…c8ac`
- `portable-launch-0.7.1-final/report.json`：同じhashで、初回・再起動ともexit 0、stderr空、playMs 0→14,950→29,950、17人、v3
- 生セーブ：`save.json` は playMs 29,950、elapsedMs 29,950、current 65小判/73EXP、legacyUnmeasuredGain null
- `GAME_SPEC.md:179` に、街にいる時間を収入0として平均に入れることが明記済み。前回の指摘2は解消しています

## 親担当の実行証拠（文書の記載のみ・私は再実行していません）
- 536テスト、typecheck、lint、Web/Windows build、release-check 116ファイル
- 実IABでの復元、日英375/1280pxの遠征録、新規47分のB31到達（B30敗北→道場・隊列調整）
- 実HTTP/SQLiteでの新rates往復とDB再起動
- 署名がNotSignedであること（manifest自体は `signature:"not-verified"` です）
- IAB全タブ・viewportと4177/4178/5177/8787 listenerの終了、ゲーム子プロセスの終了

## 残る非阻害事項
1. **時刻差の数値が文書と違います。** 初回samplesは 18:18:05.709Z→18:47:47.830Z で、実際の時刻差は**1,782,121ms**です。playMs差は 4,650→1,786,750 の**1,782,100ms**なので、差は約21ms（比0.99999）です。`VALIDATION.md:18` と今回の依頼にある「1,782,000ms／100ms差／比1.000056」は正確ではありません。実際の一致はむしろ記載より良いですが、文書は直すべきです。
2. **合格がまだ記録されていない文書が2つあります。** `HANDOFF.md:15-16` と `review-resolution.md:3,32,39` が「実行中・結果待ち」のままです。どちらも承認後に確定すると明記されているので矛盾ではありませんが、この承認を反映する必要があります。`integrated-validation.md:77` の旧hash `3643…` は、`:81` で流用しないと明記されているため問題ありません。
3. **前回からのP2はそのまま残ります。** 深淵は内容の繰り返しであること（100階すべてが固有ではない）、遠征録の置き場所、30分検査が実時間との一致を自動判定しないこと。
4. **今回の範囲外です。** Steam、実決済、公開、署名、実スマホ、クリーンPC、遠隔運用、通知領域の実操作、DPI、スリープ。全17人がそれぞれ必須になる局面、人間の満足度、無期限の安定性も保証しません。
5. **既知の削除拒否分は未削除です。** `.font-tools`、TTF 2本などは容量回収済みとして扱いません。
