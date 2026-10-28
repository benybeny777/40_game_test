# 03 成長・装備・セーブ（M4）

## 1. Profile（セーブする状態）

```ts
export interface Profile {
  version: number
  savedAt: string                     // ISO文字列。mainが書く（coreは時刻を読まない）
  rng: number                         // ドロップ・オフライン報酬用の乱数の状態（Worldとは別）
  progress: { unlockedStage: number; currentStage: number; wave: number; loop: boolean; bestStage: number }
  party: { order: JobId[]; members: Record<JobId, { lv: number; exp: number; equip: Record<SlotId, string | null> }> }
  inventory: Item[]                   // 装備中のものも含む
  koban: number
  dojo: Record<DojoKey, number>       // 購入した段階
  dex: { enemies: string[]; items: string[] }
  options: { autoSellMaxRarity: Rarity | null; autoEquip: boolean }
  rates: { minute: number[] }         // 直近10分の「1分ごとの獲得小判と経験値」。オフライン報酬の計算用
  stats: { playMs: number; kills: number; wipes: number; bossKills: number }
  nextItemId: number
}
export type SlotId = 'weapon' | 'armor' | 'charm'
export type Rarity = 0 | 1 | 2 | 3 | 4   // 並・上・特上・極・伝説
export interface Item { id: string; base: string; ilvl: number; rarity: Rarity; affixes: { k: AffixKey; v: number }[]; locked: boolean; new: boolean }
```

- 設定（表示倍率・音量・FPSなど）はProfileに入れず、`settings.json` に分ける（ゲームの進行と無関係で、壊れても進行に影響させないため）。パスは `paths.ts` に `settings` を追加する。
- DESIGN.md §12のJSONの例は、この型に置き換える。

## 2. 報酬の適用（`progress/rewards.ts`）

`applyRewards(profile, events, data): SimEvent[]`（`levelUp` などの追加イベントを返す）

- `reward`：小判 ＝ 基本値 × 獲得小判の倍率（パチプロのパッシブ・確変・装備）。経験値は報酬発生時の実World出撃3人だけに同じ量を付与する（出撃中の戦闘不能者も対象）。控えは獲得せず、既存のレベル・経験値・装備は維持する。次ウェーブ待ちの編成変更を先行適用しない。
- 経験値が `20 × lv^1.6`（切り捨て）に達したらLvを上げ、`levelUp` を出す。上限50。上限に達した分の経験値は捨てる。
- Lvや装備が変わったら、World側のユニットの `base` を作り直す（HPの割合を保つ）。これはmainの `loop.ts` が `refreshParty(world, profile)` を呼んで行う。
- `drop`：§3で装備を作り、所持品に入れる。図鑑に載っていない敵を倒した場合、オタクのパッシブでドロップ率を上げる（図鑑の更新はドロップの判定の後）。
- `phase(stageClear)`：`unlockedStage` を更新。ボスの初回撃破で、小判をステージの雑魚20体分もらう。
- 1分ごとに `rates.minute` に獲得量を積み、10個を超えたら古いものを捨てる。

## 3. 装備

### 3.1 ドロップの判定

- 雑魚1体あたりの基本確率3%、ボスは100%（レア度は上以上）。
- 確率 ＝ 基本 ×（1 + 道場のドロップ + 装備のドロップ%）× （1 + パチプロのLUK × 0.0005）。
- レア度の重み：並70・上22・特上6・極1.8・伝説0.2。r≥1の重みに `(1 + パーティのLUK合計 ÷ 500 × r)` を掛ける。
- 装備の種類：まず欄を決め（武器40%・防具35%・お守り25%）、武器ならパーティの中からランダムにジョブを選ぶ。
- 装備のLv（ilvl）＝ ステージの通し番号。

### 3.2 基本の装備（`data/items.ts`）

| 欄 | 基本の能力（ilvl 1） | 伸び方 |
|---|---|---|
| 武器 | ATK +3（ジョブで補正：サムライ・地雷系1.2、オタク0.7） | ×1.12^(ilvl−1) |
| 防具 | HP +15、DEF +2 | ×1.12^(ilvl−1) |
| お守り | 能力なし。付加効果の数が1つ多い | — |

武器の名前の例（ジョブ別、ilvlの帯で名前が変わる）：

| ジョブ | 1〜5 | 6〜10 | 11〜15 |
|---|---|---|---|
| サムライ | 錆び刀 | 打刀 | 名刀・無銘 |
| 忍者 | 苦無 | 八方手裏剣 | 影縫い |
| 地雷系 | ハートの手鏡 | 量産リボン杖 | 激重ハサミ |
| オタク | ペンライト | 推し色サイリウム | 痛うちわ |
| パチプロ | 玉の箱 | 千発箱 | 黄金のドル箱 |

防具（着流し・鎖帷子・地雷系ブラウス…）とお守り（交通安全・学業成就・金運招福…）も同様に、`items.ts` に名前の表を持つ。

### 3.3 付加効果

| キー | 範囲（並の値の幅） | 伸び方 |
|---|---|---|
| atkPct | 0.03〜0.08 | なし |
| hpPct | 0.04〜0.10 | なし |
| defPct | 0.04〜0.10 | なし |
| intervalPct | −0.02〜−0.06 | なし |
| cri | 0.01〜0.04 | なし |
| criMul | 0.05〜0.15 | なし |
| eva | 0.01〜0.03 | なし |
| luk | 1〜4 | ×(1 + ilvl×0.1) |
| kobanPct | 0.03〜0.10 | なし |
| cooldownPct | −0.03〜−0.08 | なし |
| dropPct | 0.02〜0.06 | なし |

- 個数：並0・上1・特上2・極3・伝説3（お守りは＋1）。同じキーは重ならない。
- 値：範囲から乱数で選び、レア度で倍率（並1・上1.1・特上1.25・極1.45・伝説1.7）。小数第3位で丸める。
- 伝説だけの固有効果は将来の追加（06-release.md §5）。

### 3.4 評価・自動装備・売却

- 評価値 ＝ Σ（装備した場合の能力値の変化 × そのジョブの `statWeights`）。管理パネルの「↑↓」表示と自動装備の両方に使う。
- 自動装備：オンなら、ドロップした装備の評価値が今の装備より高いジョブに装備させる。
- 自動売却：`autoSellMaxRarity` 以下でロックされていない装備は、拾った時点で売る。
- 売値：`5 × 1.15^(ilvl−1) ×（1・3・10・40・200）[レア度]` 小判。
- 所持の上限は100。いっぱいのとき、ロックされていない最も評価の低い装備を売って空ける。全部ロックされていたら、拾った装備を売値で小判に変える。

## 4. 道場（永続の強化）

| キー | 効果（1段階あたり） | 上限 | 最初の値段 |
|---|---|---|---|
| atk | 全員のATK +3% | なし | 100 |
| hp | 全員の最大HP +4% | なし | 100 |
| walk | 移動の速さ +5% | 10 | 300 |
| offline | オフライン報酬の上限 +1時間 | 8 | 1000 |
| drop | ドロップ率 +2% | 20 | 500 |

値段 ＝ 最初の値段 × 1.5^段階（切り捨て）。

## 5. オフライン報酬

- mainが、前回の `savedAt` と起動時刻の差を求めて `computeOffline(profile, elapsedMs, data)` に渡す（coreは時刻を読まない）。
- PCのスリープ（`powerMonitor` の `suspend`→`resume`）で60秒以上空いた場合も同じ扱いにする。一時停止していた時間は含めない（一時停止中は `savedAt` を更新し続ける）。
- 計算：時間 ＝ min(経過, 8時間 + 道場offline)。小判・経験値 ＝ 直近10分の1分あたりの平均 × 分数 × 0.5。装備 ＝ 10分ごとに1回、並か上だけを判定（自動売却・自動装備を適用）。
- 経験値の付与先は`offlineJobs`の実出撃3人で固定し、未受取分は`expByJob`へジョブ別に積算する。受け取り時の編成変更で振り替えない。旧データは保存時の実出撃情報、情報がない場合は旧編成先頭3人へ一度固定し、既存レベルは下げない。
- 1分未満なら何もしない。`rates` が空（新規）なら0。
- 結果は「おかえり」画面のために `pendingOffline` として持ち、受け取る操作（M5の `claimOffline`）で反映する。受け取る前に終了した場合も、次回の起動時に再び出す（二重に足さないよう、計算時点で `savedAt` を進める）。

## 6. セーブの保存（`src/main/saveStore.ts`）

- 保存先は `paths.ts` の `save` と `previousSave`（M0で定義済み）。追加で `settings`。
- 書き込み：`save.json.tmp` に書く → `fsync` → 今の `save.json` を `save.prev.json` に置き換える → `tmp` を `save.json` に置き換える。
- 書くタイミング：30秒ごと、ステージクリア、パネルでの操作の後（1秒まとめる）、終了時（`before-quit` で同期的に書く）。
- 読み込み：`save.json` → 失敗なら `save.prev.json` → 失敗なら新規。失敗の理由と、壊れたファイルを `save.broken-<時刻>.json` として1つだけ残し、ログに記録する（取り戻せないデータの可能性があるため残す。2つ目以降は上書き）。
- 検証：読んだJSONを `validateProfile` で確かめる（数値がNaN・負・範囲外、知らないジョブ・装備、重複したID）。依存を増やさず手書きで行う。
- 移行：`migrations: Array<(old: unknown) => unknown>`。`version` を1つずつ上げる。各移行にテストを付ける。

## 7. 開発用の機能

- 環境変数 `GAME_SPEED`（開発プロファイルのときだけ有効、1〜50）で、シミュレーションの速さを倍にする。
- 開発プロファイルのときだけ、管理パネルの設定に「開発」欄を出す：小判を足す、ステージを移る、装備を作る、オフライン報酬を試す（経過時間を指定）。利用者のプロファイルでは、機能そのものを読み込まない。

## 8. 受入条件（M4）

- テスト：Lvアップの境目、ドロップのレア度の比率（10万回の判定で±1%以内）、付加効果が重ならない、所持がいっぱいのときの動き、道場の値段、オフライン報酬の上限と0.5倍、二重に受け取れないこと。
- テスト：壊れたセーブ（途中で切れたJSON、NaN入り）を読むと、prevから戻る。prevも壊れていれば新規になり、brokenファイルが1つだけ残る。
- 実画面：遊んで終了 → 再起動で、Lv・装備・小判・ステージが戻ることを確認。開発用のセーブが `.dev-data/` にあり、利用者の場所に作られていないことを確認。
