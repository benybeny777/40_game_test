# 04 IPCと管理パネル（M5。IPCの土台はM2から）

## 1. mainのループ（`src/main/loop.ts`）

- `setInterval(…, 25)` で実時間を測り、溜まった時間が100msを超えるたびに `step` を1回呼ぶ（1回のループで最大20回。それを超える遅れはオフライン報酬として扱う）。
- `step` の後に `applyRewards` → 必要なら `refreshParty`。
- 帯へは、ステップのたびに `sim:frame`（スナップショット＋そのティックのイベント）を送る。帯が非表示のときは送らない（表示したときに最新のスナップショットを1回送る）。
- パネルへは、Profileが変わったときだけ `profile:view` を送る（最大2回/秒にまとめる）。パネルが隠れているときは送らない。
- 一時停止：ループは回したまま `step` を呼ばない。`savedAt` は更新する（03 §5）。

## 2. チャンネル

M0の `src/shared/api.ts` を広げる。チャンネル名と型は `src/shared/` だけで定義する。

| チャンネル | 向き | 内容 |
|---|---|---|
| `strip:pointer` | 帯→main | M0のまま（当たり判定の上にいるか） |
| `strip:panel` | 帯→main | `{ tab?: PanelTab; job?: JobId }` を受け取れるように変更 |
| `strip:menu` | 帯→main | M0のまま |
| `strip:layout` | main→帯 | `{ dotPx, playHeightPx, headroomPx, scaleFactor }`（02 §1） |
| `sim:frame` | main→帯 | `{ snapshot: Snapshot; events: SimEvent[] }` |
| `app:state` / `app:get-state` | main→両方 | M0の `ShellState`。`settings` を追加 |
| `profile:view` / `profile:get` | main→パネル | `ProfileView`（§3） |
| `cmd` | パネル→main | `invoke`。`Command` を送り `{ ok: true } \| { ok: false; reason: string }` を受け取る |
| `panel:navigate` | main→パネル | 帯でキャラをクリックしたときの、開くタブとジョブ |

- mainは、送り主のウィンドウ（`event.sender`）を必ず確かめる（M0と同じ）。帯から `cmd` を受け付けない。
- 受け取った値は、`src/shared/validate.ts` の手書きの検証を通してから使う。

## 3. ProfileView

パネルに渡す読み取り専用の形。Profileをそのまま渡さず、表示に必要な計算済みの値を含める。

```ts
interface ProfileView {
  koban: number
  progress: Profile['progress'] & { stageLabel: string; areaName: string }
  party: Array<{ job: JobId; name: string; lv: number; exp: number; expNext: number
                 stats: Stats; equip: Record<SlotId, ItemView | null>
                 skills: Array<{ id: string; name: string; desc: string; unlocked: boolean; unlockLv: number }> }>
  inventory: ItemView[]               // 装備中のものは除く
  dojo: Array<{ key: DojoKey; name: string; level: number; max: number | null; cost: number; desc: string }>
  stages: Array<{ no: number; label: string; areaName: string; unlocked: boolean; cleared: boolean }>
  dex: { enemies: Array<{ id: string; name: string; seen: boolean; desc?: string }>; items: … }
  options: Profile['options']
  pendingOffline: OfflineResult | null
  rates: { kobanPerMin: number; expPerMin: number }
}
interface ItemView extends Item { name: string; slot: SlotId; job?: JobId; sellPrice: number
                                  lines: string[]          // 表示用の能力の文
                                  scoreDelta: Partial<Record<JobId, number>> }  // 装備した場合の評価値の差
```

## 4. コマンド

```ts
type Command =
  | { c: 'reorderParty'; order: JobId[] }
  | { c: 'equip'; job: JobId; slot: SlotId; itemId: string | null }
  | { c: 'sell'; itemIds: string[] }
  | { c: 'lock'; itemId: string; locked: boolean }
  | { c: 'markSeen'; itemIds: string[] }           // 「新」の印を消す
  | { c: 'setOptions'; options: Partial<Profile['options']> }
  | { c: 'selectStage'; stageNo: number }          // 解放済みのみ。次のウェーブの頭から
  | { c: 'setLoop'; loop: boolean }
  | { c: 'buyDojo'; key: DojoKey }
  | { c: 'claimOffline' }
  | { c: 'updateSettings'; settings: Partial<Settings> }
  | { c: 'dev'; action: DevAction }                // 開発プロファイルのみ（03 §7）
```

- コマンドは、mainが次のティックの頭で `applyCommand(profile, world, cmd)`（core）に渡す。結果は `invoke` の戻り値で返す。
- `selectStage`：戦闘中なら、そのウェーブが終わった時点で移る（途中で戦闘を捨てない）。

## 5. 管理パネルの画面

- Preact（`preact` と `@preact/preset-vite`）を使う。理由：2回/秒で状態が届いても、スクロールや入力中の値を失わずに差分で描き直せる。ほかのUIライブラリは入れない。
- フォント：DotGothic16（OFL）を `assets/fonts/` に同梱し、CREDITS.mdに出典とライセンスを書く。
- 色は `docs/images/game-concept.png` の雰囲気：紺の背景（`#121723`）、金の縁（`#d9b25f`）、本文は生成り（`#f3ead6`）。レア度の色：灰・緑・青・紫・金。
- 最小の大きさ620×420で崩れないこと（M0の `minWidth/minHeight`）。

| タブ | 中身 |
|---|---|
| パーティ | 5人のカード（ドット絵を4倍、Lv、経験値のバー、主な能力値）。ドラッグか「←→」ボタンで隊列を変える。先頭に「前衛」の印 |
| 装備 | 左：選んだジョブの3つの欄。右：所持品の一覧（欄で絞り込み、レア度・評価・新しい順で並べ替え）。項目にマウスを乗せると能力の比較（↑緑・↓赤）。ロック、売却（複数選択）、自動売却のレア度、自動装備のオン／オフ |
| スキル | ジョブごとに、通常攻撃・スキル・パッシブ・奥義の説明と解放Lv。数値は今のLvでの値 |
| 道場 | 強化の一覧と値段。買えないものは暗くする |
| ステージ | エリアごとのステージの一覧（解放済み・クリア済み）、周回のオン／オフ、今の小判/分・経験値/分 |
| 図鑑 | 敵（見ていない敵は影だけ）と、拾った装備の種類 |
| 設定 | 表示サイズ、配置、地面の帯、FPSの上限、音量、ログオン時の自動起動（M7）、全画面時に隠す（M7）、セーブのフォルダを開く |

- 「おかえり」画面：`pendingOffline` があるとき、パネルを開いた時点で前面に出す（起動時に自動ではパネルを開かない。トレイに「おかえり報酬があります」の通知を1回出す）。
- 帯のキャラをクリック → `panel:navigate` でパーティのタブ（そのジョブ）を開く。

## 6. 受入条件（M5）

- コマンドの検証のテスト（知らないジョブ、所持していない装備、解放していないステージ、小判が足りない道場は `ok:false`）。
- 実画面：隊列を変えると、帯の並びが次のティックで変わる。装備を変えると、能力値と帯のツールチップの値が一致する。
- 実画面：620×420と最大化の両方で、7つのタブの表示が崩れない。パネルを閉じても帯は動き続ける。
- パネルを開いたまま30分放置しても、メモリが増え続けない（タスクマネージャーで開始時と30分後を比べて記録）。
