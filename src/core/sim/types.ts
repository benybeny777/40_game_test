import type { currentRollVersion } from '../data/items.ts'
import type { SkillEngraving } from '../data/skillEngravings.ts'
export type JobId = 'samurai' | 'ninja' | 'jirai' | 'otaku' | 'pachipro' | 'miko' | 'bancho' | 'gyaru' | 'sukeban' | 'farmer' | 'maid' | 'jiangshi' | 'vagabond' | 'rikishi' | 'sister' | 'tono' | 'gariben'
export type Side = 'ally' | 'enemy'
export type Phase = 'town' | 'walking' | 'spawning' | 'bossIntro' | 'battle' | 'waveClear' | 'stageClear' | 'wipe'
export type Targeting = 'front' | 'nearest' | 'lowestHp' | 'random'
export interface Stats {
  maxHp: number; atk: number; def: number; intervalMs: number
  cri: number; criMul: number; eva: number; luk: number; rangeDots: number
  dmgTakenMul: number; kobanMul: number; dropMul: number; cooldownMul: number; skillPowerMul: number; skillDurationMul: number
}
export type EffectKind = 'atkPct' | 'dmgTakenPct' | 'evaAdd' | 'intervalPct' | 'invuln' | 'obsession' | 'kobanPct' | 'aggroAdd' | 'nextCrit' | 'deathWard' | 'criAdd'
export interface Effect { kind: EffectKind; value: number; untilTick: number; sourceUid: number; tag: string }
export interface Unit {
  uid: number; side: Side; defId: string; slot: number; x: number; hp: number; lv: number
  stats: Stats; base: Stats; alive: boolean
  action: { kind: 'none' | 'move' | 'windup' | 'cast'; untilTick: number; targetUid?: number; skillId?: string; roll?: number; targetUids?: number[]; originX?: number; interruptSource?: { uid: number; skillId: string } }
  attackReadyTick: number; skillReadyTick: number; ult: number; gauges: { jonen?: number; phantoms?: number; split?: number; raised?: number; wardUsed?: number }
  effects: Effect[]; aggro: number
}
export interface HitPayload { mul: number; forceCrit?: boolean; aoeDots?: number; tags?: string[] }
export interface Projectile { id: number; ownerUid: number; targetUid: number; launchTick: number; hitTick: number; kind: string; payload: HitPayload }
export interface Mine { id: number; ownerUid: number; x: number; armTick: number; explodeTick: number; payload: HitPayload }
export interface World {
  tick: number; rng: number; phase: Phase; phaseUntilTick: number; stageNo: number; wave: number; loop: boolean
  units: Unit[]; reserves: Unit[]; projectiles: Projectile[]; mines: Mine[]; nextId: number; wipeStreak: number
  spawnQueue: string[]; spawnIndex: number; nextSpawnTick: number; moveBonus: number
  maxStage: number; depthRank: import('../data/dungeon.ts').Difficulty; dungeonSeed: number; eventDepths: [number, number, number]
  pending: { stageNo?: number; depthRank?: import('../data/dungeon.ts').Difficulty; order?: JobId[] }
}
export interface SnapshotUnit {
  uid: number; side: Side; defId: string; slot: number; x: number; hpRatio: number; hp: number; maxHp: number; alive: boolean; lv: number
  action: Unit['action']['kind']; ult: number; ultOn: boolean; skillReady: number; skillRemainingMs: number; jonen?: number; effects: string[]
  bossCast?: { skillId: string; targetUids: number[]; resolveTick: number }
}
export interface Snapshot {
  tick: number; phase: Phase; stageNo: number; depthRank: import('../data/dungeon.ts').Difficulty; wave: number; koban: number; loop: boolean
  units: SnapshotUnit[]
  projectiles: Array<{ id: number; kind: string; fromUid: number; toUid: number; launchTick: number; hitTick: number }>
  mines: Array<{ id: number; x: number; explodeTick: number }>
}
export type SimEvent =
  | { t: 'bossTell'; uid: number; skillId: string; targetUids: number[]; resolveTick: number }
  | { t: 'bossInterrupt'; uid: number; skillId: string; sourceUid?: number; interruptSkillId?: string }
  | { t: 'attack'; uid: number; targetUid: number; kind: 'melee' | 'ranged' }
  | { t: 'damage'; uid: number; sourceUid: number; amount: number; crit: boolean; tags?: string[] }
  | { t: 'miss'; uid: number; sourceUid: number }
  | { t: 'heal'; uid: number; sourceUid: number; amount: number }
  | { t: 'skill' | 'ultimate'; uid: number; skillId: string; roll?: number }
  | { t: 'effect'; uid: number; tag: string; on: boolean }
  | { t: 'death' | 'revive' | 'spawn'; uid: number }
  | { t: 'phase'; phase: Phase; stageNo: number; wave: number; depthRank?: import('../data/dungeon.ts').Difficulty }
  | { t: 'floorEvent'; kind: 'treasure' | 'altar'; stageNo: number; depthRank: import('../data/dungeon.ts').Difficulty }
  | { t: 'kakuhen'; uid: number; hit: boolean }
  | { t: 'reward'; koban: number; exp: number; enemyId: string; x: number; stageNo?: number }
  | { t: 'explode'; x: number; radius: number }
  | { t: 'drop'; x: number; rarity: number; name: string; equippedBy?: JobId; sold?: boolean; sale?: { reason: 'auto' | 'capacity'; name: string; rarity: number; koban: number } }
  | { t: 'levelUp'; job: JobId; lv: number }
export interface AttackDef { kind: 'melee' | 'ranged'; mul: number; projectile?: string; targeting: Targeting }
/** What an equipped item contributes to stats (full item metadata lives in progress/items.ts). */
export interface GearStats { rollVersion?: typeof currentRollVersion; rarity?: import('../data/items.ts').Rarity; engraving?: SkillEngraving; atk: number; hp: number; def: number; affixes: Array<{ k: import('../data/items.ts').AffixKey; v: number }> }
