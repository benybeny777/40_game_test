# 01 戦闘コア（M1・M3）

## 1. 全体の形

```
Profile（育成の状態：Lv・装備・所持品・小判・道場）   ← セーブされる
   │ buildParty(profile, data)
   ▼
World（戦闘の状態：ユニット・弾・地雷・フェーズ）       ← セーブしない（再開時はウェーブの頭から）
   │ step(world, commands) → SimEvent[]
   ▼
applyRewards(profile, events) → Profileの更新（経験値・小判・ドロップ）
```

- `World` は1ウェーブ分の戦闘を表す一時的な状態。`Profile` は長く残る状態。この2つを混ぜない。
- 状態を変更する関数は `step` と `applyRewards` と `applyCommand`（M5）だけ。描画やパネルは `snapshot()` で読むだけ。

### ファイル

```
src/core/
  sim/
    rng.ts         # mulberry32。状態はuint32の数値1つ
    types.ts       # World, Unit, Effect, Projectile, Mine, SimEvent, Snapshot
    world.ts       # createWorld, step, snapshot。フェーズの遷移
    combat.ts      # 狙う相手の選び方、命中・回避・会心・ダメージ
    stats.ts       # computeStats（基本値＋成長＋装備＋道場＋効果）
    effects.ts     # 効果の付与・上書き・時間切れ
    skills.ts      # スキル・パッシブ・奥義の実装（ID → 関数）
    enemyAi.ts     # 敵の特性（ranged, split, explode など）とボスの行動
  data/
    balance.ts     # 計算式の係数（ティック、会心倍率、DEF係数など）
    jobs.ts  enemies.ts  stages.ts  items.ts  dojo.ts
  progress/        # M4（03-progression-save.md）
  index.ts         # 外部に公開するAPIだけをexport
tools/sim-runner.ts
tests/core/*.test.ts
```

## 2. 時間と空間

- 1ティック＝100ms（`balance.tickMs`）。`step` は1ティックだけ進める。
- 空間は1本の横の線（ドット単位のx座標）。右が前。**画面の幅に依存しない**。
  - 味方の位置は隊列で固定：先頭 x=0、2番目 x=−18、3番目 −36、4番目 −54、5番目 −72。
  - 敵は x=+160 に現れ、自分の射程に味方が入るまで左へ歩く。近接の敵は「先頭の味方のx＋14」で止まる。複数いる近接の敵は、後ろの敵ほど＋10ずつずらして並ぶ。
  - 描画側は x=0 を画面上の「パーティの基準点」に対応させるだけ（02-strip.md §4）。
- 射程（ドット）：近接 16、遠隔 220（味方）。敵の遠隔は敵ごとにデータで決める。

## 3. フェーズ

```
walking ──(歩いた時間が walkMs に達する)──▶ spawning ──(敵が全員出る)──▶ battle
battle ──(敵が全滅)──▶ waveClear(1000ms) ──▶ walking（次のウェーブ）／ stageClear（10ウェーブ目の後）
battle ──(味方が全滅)──▶ wipe(3000ms) ──▶ walking（同じステージのウェーブ1）
stageClear(2000ms) ──▶ walking（次のステージ or 周回で同じステージのウェーブ1）
10ウェーブ目の spawning の前に bossIntro(1500ms)
```

- `walkMs` は 4000ms ÷（1＋道場の移動速度）。歩いている間、味方は最大HPの2%/秒ずつ回復する。
- waveClear で戦闘不能の味方はHP30%で起き上がる。生きている味方も最大HPの30%を回復する。
- 一時停止中は `step` を呼ばない（呼ぶ側の責任）。

## 4. 主要な型

```ts
export type JobId = 'samurai' | 'ninja' | 'jirai' | 'otaku' | 'pachipro'
export type Side = 'ally' | 'enemy'
export type Phase = 'walking' | 'spawning' | 'bossIntro' | 'battle' | 'waveClear' | 'stageClear' | 'wipe'

export interface Stats {
  maxHp: number; atk: number; def: number
  intervalMs: number       // 通常攻撃の間隔
  cri: number; criMul: number; eva: number; luk: number
  rangeDots: number
  dmgTakenMul: number      // 受けるダメージの倍率（1が基準）
  kobanMul: number; dropMul: number; cooldownMul: number
}

export interface Unit {
  uid: number                // World内で一意。描画との対応づけに使う
  side: Side
  defId: string              // JobId または敵ID
  slot: number               // 味方は隊列の位置（0が先頭）、敵は出現順
  x: number
  hp: number
  stats: Stats               // computeStatsの結果。効果が変わったら再計算する
  base: Stats                // 効果を除いた値（Lv・装備・道場だけ）
  alive: boolean
  action: { kind: 'none' | 'move' | 'windup' | 'cast'; untilTick: number; targetUid?: number }
  attackReadyTick: number
  skillReadyTick: number
  ult: number                // 奥義ゲージ 0〜100
  gauges: { jonen?: number } // 地雷系の情念など、ジョブ固有の値
  effects: Effect[]
  aggro: number              // 狙われやすさの重み（基準1）
}

export interface Effect {
  kind: EffectKind           // 'atkPct' | 'dmgTakenPct' | 'evaAdd' | 'intervalPct' | 'invuln' | 'obsession' | 'kobanPct' | 'aggroAdd' | 'nextCrit'
  value: number
  untilTick: number          // Number.MAX_SAFE_INTEGER なら時間切れなし（そのウェーブの間）
  sourceUid: number
  tag: string                // 上書きの判定キー。同じ tag の効果は新しいもので置き換える
}

export interface Projectile { id: number; ownerUid: number; targetUid: number; hitTick: number; kind: string; payload: HitPayload }
export interface Mine { id: number; ownerUid: number; x: number; explodeTick: number; payload: HitPayload }
export interface HitPayload { mul: number; forceCrit?: boolean; aoeDots?: number; tags?: string[] }

export interface World {
  tick: number
  rng: number
  phase: Phase
  phaseUntilTick: number
  stageNo: number            // 通し番号（1始まり）。表示は「エリア-ステージ」
  wave: number               // 1〜10
  loop: boolean
  units: Unit[]
  projectiles: Projectile[]
  mines: Mine[]
  nextId: number
  wipeStreak: number         // 同じステージで続けて全滅した回数
}
```

- 敵と味方を1つの `units` 配列に入れる。死んだ敵はウェーブの終わりに取り除く（描画が倒れるアニメを出せるよう、すぐには消さない）。
- 配列の並び順は「味方（slot順）→ 敵（出現順）」に保つ。処理の順番を決めるため。

## 5. 1ティックの処理順

順番を変えると結果が変わるので、この順を守る。

1. コマンドを適用（M5：隊列の変更・装備の変更など。戦闘中の変更は `base` を作り直し、HPの割合を保つ）
2. 効果の時間切れを除去 → 変化があったユニットの `stats` を再計算
3. フェーズの処理（遷移、出現、回復）
4. battle中のみ：
   1. 移動（`action.kind==='move'` の敵）
   2. 着弾（`hitTick===tick` の弾）→ 地雷の爆発（踏まれたか時間切れ）
   3. 行動の決定：`units` の順に、行動中でなく生きているユニットについて
      奥義（ゲージ100かつ相手がいる）＞ スキル（`skillReadyTick<=tick`）＞ 通常攻撃（`attackReadyTick<=tick`）の順で1つだけ始める
   4. windupの終わり（`untilTick===tick`）：命中の処理、または弾の発射
   5. 死亡の判定 → `death` イベント、地雷系の情念の加算、パッシブの発動条件の判定
   6. 勝敗の判定
5. `tick += 1`

- 通常攻撃：windupは200ms（2ティック）。近接は windup終了時に命中。遠隔は windup終了時に弾を出し、`hitTick = 今 + ceil(距離 ÷ 弾速 ÷ tickMs)`（弾速は240ドット/秒）。
- 弾が着く前に相手が死んでいたら、同じ側で一番近い生きている相手へ当てる。いなければ消える。
- `attackReadyTick = 攻撃を始めたtick + ceil(intervalMs ÷ tickMs)`。

## 6. 描画とのやりとり（M2で固定）

```ts
export interface Snapshot {
  tick: number; phase: Phase; stageNo: number; wave: number; koban: number
  units: Array<{ uid: number; side: Side; defId: string; x: number; hpRatio: number; alive: boolean
                 action: Unit['action']['kind']; ult: number; jonen?: number; effects: string[] /* tag */ }>
  projectiles: Array<{ id: number; kind: string; fromUid: number; toUid: number; launchTick: number; hitTick: number }>
  mines: Array<{ id: number; x: number; explodeTick: number }>
}

export type SimEvent =
  | { t: 'attack'; uid: number; targetUid: number; kind: 'melee' | 'ranged' }
  | { t: 'damage'; uid: number; sourceUid: number; amount: number; crit: boolean; tags?: string[] }
  | { t: 'miss'; uid: number; sourceUid: number }
  | { t: 'heal'; uid: number; sourceUid: number; amount: number }
  | { t: 'skill'; uid: number; skillId: string }
  | { t: 'ultimate'; uid: number; skillId: string; roll?: number }   // パチプロの大当たりの出目など
  | { t: 'effect'; uid: number; tag: string; on: boolean }
  | { t: 'death'; uid: number }
  | { t: 'revive'; uid: number }
  | { t: 'spawn'; uid: number }
  | { t: 'phase'; phase: Phase; stageNo: number; wave: number }
  | { t: 'kakuhen'; uid: number; hit: boolean }                      // 確変チャレンジの結果
  | { t: 'reward'; koban: number; exp: number; enemyId: string; x: number }
  | { t: 'drop'; x: number; rarityHint: number }                     // 中身はapplyRewardsで決める
  | { t: 'levelUp'; job: JobId; lv: number }                         // applyRewardsが出す
```

- `step` はそのティックのイベントだけを返す。描画側は「スナップショット＋イベント」を受け取って演出する（02-strip.md §5）。
- イベントの種類はM3で増えてよいが、既存のフィールドの意味は変えない。

## 7. 計算式

`balance.ts` の初期値：`criMulBase=1.5`、`defK=2`、`variance=0.1`、`ultFromDealt=5`（ATKの20倍のダメージで100）、`ultFromTaken=50`。

- 能力値：`base = job.base × (1 + job.growth × (lv−1))`、その後に装備の加算 → 装備の% → 道場の% の順に掛ける。INTは成長しない。
- 効果：`atk = base.atk × (1 + Σ atkPct)`、`intervalMs = base.intervalMs × max(0.3, 1 + Σ intervalPct)`、`eva = min(0.75, base.eva + Σ evaAdd)`。
- 命中：`invuln` があれば0ダメージ（`miss` イベント）。`rng < eva` なら回避。範囲攻撃は回避できない。
- ダメージ：`floor(max(1, atk × mul × 100 ÷ (100 + def × defK) × (1 ± variance) × 会心 × 相手のdmgTakenMul × 執着))`
  - 会心：`forceCrit` または `rng < cri`。倍率は `criMul`。
- 奥義ゲージ：与えたダメージで `+ ultFromDealt × 与ダメ ÷ atk`、受けたダメージで `+ ultFromTaken × 被ダメ ÷ maxHp`。上限100。
- 乱数を引く順番：命中 → 会心 → ばらつき。毎回この順で引く（同じシードで同じ結果になるため）。

## 8. スキルの仕組み（M3）

スキルは「データ（数値）」と「実装（関数）」に分ける。

```ts
// data/jobs.ts
export interface JobDef {
  id: JobId; name: string; role: string; weapon: string
  base: Stats; growth: { hp: number; atk: number; def: number; cri: number; eva: number; luk: number }
  attack: { kind: 'melee' | 'ranged'; mul: number; projectile?: string; targeting: Targeting }
  skill:   { id: string; unlockLv: 1;  cooldownMs: number; params: Record<string, number> }
  passive: { id: string; unlockLv: 5;  params: Record<string, number> }
  ultimate:{ id: string; unlockLv: 15; params: Record<string, number> }
  statWeights: Partial<Record<keyof Stats, number>>   // 自動装備の評価用（03 §3）
}
export type Targeting = 'front' | 'nearest' | 'lowestHp' | 'random'

// sim/skills.ts
interface SkillContext { world: World; self: Unit; data: GameData; emit(e: SimEvent): void; rng(): number }
export const skills: Record<string, {
  canUse?(ctx: SkillContext): boolean      // 相手がいない、回復の必要がない、など
  use(ctx: SkillContext): void
}>
export const passives: Record<string, {
  onWaveStart?(ctx): void; onTick?(ctx): void; onDamaged?(ctx, amount: number): void
  onAllyDamaged?(ctx, ally: Unit, amount: number): void; modifyStats?(self: Unit, stats: Stats): void
}>
```

- `canUse` が false なら、スキルは使わず再使用時間も消費しない（例：差し入れは、HPが90%未満の味方がいないときは使わない）。
- 奥義の発動中（cast 600ms）は、ほかの行動をしない。発動時に `ultimate` イベントを出し、cast終了時に効果を出す。

### ジョブ別の実装メモ（数値はDESIGN.md §6.3）

| ジョブ | 実装のポイント |
|---|---|
| サムライ | 居合＝`nextCrit` 効果（次の通常攻撃で消費、倍率2.5に置換）。仁王立ち＝先頭のとき `aggroAdd 0.2`・`dmgTakenPct −0.15`、HP50%以下で `atkPct +0.3`（`modifyStats` で毎回判定）。一閃＝敵全体、回避不可 |
| 忍者 | 通常攻撃の狙いは `lowestHp`。影分身＝`evaAdd 0.5` 3秒。急所突き＝相手のHPが30%以下なら会心率+0.25（命中処理の中で判定）。微塵隠れ＝全体＋自分に `invuln` 2秒 |
| 地雷系 | 情念は `gauges.jonen`。`onDamaged` と `onAllyDamaged` で加算。執着＝`obsession` 効果（tag固定で上書き）。地雷設置＝`Mine` を、一番前の敵のxに置く。敵の足元のx±6に入るか3秒たつと爆発。重い愛＝jonen≥50で `atkPct +0.25`・`dmgTakenPct +0.1`。激重ラブボム＝倍率 `2 + jonen/50`、使ったら0 |
| オタク | 差し入れ＝HPの割合が最小の味方。回復量 `atk×3 + maxHp×0.1`、最大HPを超えない。推しへの愛＝`onWaveStart` で味方全体に `atkPct +0.1`（そのウェーブの間）。図鑑の初遭遇ボーナスはM4の `applyRewards` 側で処理 |
| パチプロ | 玉はじき＝1〜3発（乱数）。弾ごとに命中判定。確変チャレンジ＝確率 `min(1/3, 1/8 + luk×0.001)`。当たり→味方全体 `intervalPct −0.3`・`kobanPct +0.5` 10秒、`kakuhen{hit:true}`。外れ→`reward{koban: 小}`。大当たり＝出目N（1〜7）を引き、7の重みは `1 + luk/100`。倍率N、7なら小判ボーナス（ステージの雑魚1体分×10） |

## 9. sim-runner

```
pnpm sim -- --stage 3 --minutes 30 --seed 1 [--lv 10] [--progress] [--json]
```

- `--stage` 固定：そのステージを周回させる。`--lv` で全員のLvを固定（装備なし）。
- `--progress`：新しいセーブから、自動装備・自動売却・道場の自動購入（一番安いもの）をオンにして、指定した分数だけ遊んだことにする。M6の調整に使う。
- 出力（1分ごと、最後に合計）：到達ステージ、ウェーブ1回あたりの平均時間、ステージクリアの平均時間、全滅率、小判/分、経験値/分、ドロップのレア度の内訳、ジョブ別の与ダメ・回復の割合。
- 実行は `tsx` などで `src/core` を直接動かす（Electronを起動しない）。2時間分のシミュレーションが10秒以内に終わること。

## 10. 受入条件

**M1**（通常攻撃とエリア1の雑魚だけ）
- 同じシード・同じコマンドで10分間回したとき、スナップショットのハッシュが一致するテスト。
- 計算式のテスト：DEF0・会心なし・ばらつきなしで `atk×mul` になる。回避・会心・最小1ダメージ。
- フェーズの遷移のテスト：ウェーブクリア → 次ウェーブ、10ウェーブ目の後 → stageClear、全滅 → wipe → ウェーブ1。
- `pnpm sim -- --stage 1 --minutes 10` が統計を出す。
- ESLintで `src/core` 内の `Math.random` / `Date` の使用を検出できる。

**M3**（スキル・パッシブ・奥義・固有ゲージを全ジョブ分）
- スキルごとに最低1つの単体テスト（例：居合の次の一撃が必ず会心、差し入れが最大HPを超えない、激重ラブボムで情念が0になる、確変の確率が上限1/3を超えない）。
- sim-runnerでのジョブ別の与ダメの割合が、アタッカー（サムライ・忍者・地雷系・パチプロ）でそれぞれ12〜35%に収まる（Lv15・装備なし・ステージ5）。
- 実画面で各スキル・奥義の演出が出ることを確認（M2の描画の上で）。
