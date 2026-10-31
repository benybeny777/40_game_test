## 再判定: 新たな具体欠陥なし。製品コード凍結は可

コードとテストを読んで確認しました。編集はしていません。テストは私の側では実行していないので、最終結果は親の実行待ちです。

### (1) 致死echo
- `now` は `scene.ts:91` で GAME_SPEED 倍されています。`defeatHoldMs = hitStopMs = 45×GAME_SPEED`、`defeatMs = 360×GAME_SPEED` なので、実時間で最初の45msがflash、残り315msが飛翔です（`impactPresentation.ts:6-11`）。
- hold中は t=0 なので、dx/tilt=0、alpha=1 のままその場で止まります。描画は `scene.ts:319-324` で `pose.flash` をそのまま使っています。
- 境界（44/45ms）は `tests/impact-presentation.test.ts:6-10` で固定されています。

### (2) syncMeleeImpact
- 同期するのは、`normalMelee`（味方かつ `kind==='melee'`、`scene.ts:153`）で、遠隔でなく、タグが iai/slowFollowup だけで、命中予定時刻±2tick の場合に限られます。
- 技能では `normalMelee=false` になり（`scene.ts:185/196/211`）、反撃は counter タグで除外されます。
- sim側の `strike` を全部確認しました。タグ無しは通常攻撃と二連撃（`world.ts:326-328`）だけです。投射物・地雷・爆発・技能にはすべてタグか ranged が付いているので、別の標的への誤同期は起きません。

### 通知まわり
- sale と ハズレ は kind info なので、`combatLabelGate` の間引き（全体3.2秒、同じ文言8秒）を通り、表示は1秒です。combo は間引かれず1秒表示です。
- 装備loot の順序も確認しました。ドロップは waveClear の待ち時間の後に来る stageClear より先に出るので（`world.ts:178-179`）、loot 表示中に来た踏破（good）は待ちに回ります。boss 表示中に来た loot は待ちに残り、boss/bad が来ても消されません（`battleNotice.ts:36`）。場面が切り替わっても earned 扱いで残ります。テストもこの流れと一致しています。

### 修正不要と判断した軽微点
- **loot通知の待ち枠が1つだけ:** loot表示中に装備loot（rarity2ラベルを含む）が短時間に3つ以上続くと、途中の通知が上書きされます。アイテム自体は入手済みで、地面の輝きやEQUIP表示は残るので、データは失われません。
- **間引きの枠を無駄に使う:** gate を通った info が、上位の通知に負けて表示されなかった場合でも間引きの枠を使うため、その後3.2秒はほかの定型表示も抑えられます。抑える方向に働くので、爽快感への害はありません。

### 前提として残ること
- 実右IABでのB6到達と全滅0は、最後のflash同期修正の前の描画で確認されたものです。修正後の表示は、親が再読込して操作で確かめる必要があります。
- 全体743/744は作業途中の記録で、最終テストは親が実行中です。
- GitHub Actions は使っていません。
