import { balance, createWorld, dungeonBalance, enemies, jobs, partyOrder, snapshot, step, type JobId, type SimEvent, type Snapshot } from '../../core/index.ts'
import { normalWindupMs } from '../strip/actionPresentation'

export type PreviewMode = 'attack' | 'walking' | 'skill' | 'ultimate' | 'loot' | 'numbers' | 'boss' | 'interrupt'
export interface Cue { at: number; snapshot: Snapshot; events: SimEvent[] }

/** Synthetic presentation events over a real core snapshot. No platform, save, or account access. */
export function sceneFixture(job: JobId, biome: number, mode: PreviewMode): Cue[] {
  if (!partyOrder.includes(job) || !Number.isInteger(biome) || biome < 0 || biome > 2) throw new Error('Invalid scene fixture selection')
  const world = createWorld({ seed: 1, level: 10, stageNo: 1 + biome * dungeonBalance.themeSpan, order: [job, ...partyOrder.filter(id => id !== job)] })
  for (let i = 0; i < 100 && !world.units.some(unit => unit.side === 'enemy' && unit.alive); i++) step(world)
  const base = snapshot(world, 1234)
  base.tick = 0; base.phase = mode === 'walking' ? 'walking' : 'battle'
  base.projectiles = []; base.mines = []
  if (mode === 'walking') base.units = base.units.filter(unit => unit.side === 'ally')
  for (const unit of base.units) { unit.action = 'none'; unit.effects = [] }
  const actor = base.units.find(unit => unit.side === 'ally' && unit.defId === job)!
  const target = base.units.find(unit => unit.side === 'enemy')
  if (target) target.x = 18
  const cue = (at: number, events: SimEvent[], adjust?: (value: Snapshot) => void): Cue => {
    const value = structuredClone(base); value.tick = Math.floor(at / balance.tickMs)
    adjust?.(value)
    return { at, snapshot: value, events }
  }
  if (mode === 'walking') return [cue(0, [])]
  if (!target) throw new Error('Scene fixture failed to spawn an enemy')
  if (mode === 'boss' || mode === 'interrupt') {
    target.defId = ['ooni', 'manekitaisho', 'denno_kyubi'][biome]
    const skill = enemies[target.defId].boss!.skill
    const targetUids = skill.kind === 'summon' ? [] : base.units.filter(unit => unit.side === 'ally').slice(0, skill.targets).map(unit => unit.uid)
    const resolveTick = skill.castMs / balance.tickMs
    const cues: Cue[] = []
    for (let at = 0; at < skill.castMs; at += balance.tickMs) cues.push(cue(at, at === 0 ? [{ t: 'bossTell', uid: target.uid, skillId: skill.id, targetUids, resolveTick }] : [], value => {
      const boss = value.units.find(unit => unit.uid === target.uid)!
      boss.action = 'cast'; boss.bossCast = { skillId: skill.id, targetUids, resolveTick }
      if (mode === 'interrupt' && at >= 500) boss.x += 20
    }))
    cues.push(cue(skill.castMs, [{ t: mode === 'boss' ? 'skill' : 'bossInterrupt', uid: target.uid, skillId: skill.id }], value => {
      if (mode === 'interrupt') value.units.find(unit => unit.uid === target.uid)!.x += 20
    }))
    return cues
  }
  if (mode === 'loot') return [cue(0, [
    { t: 'drop', x: 18, rarity: 4, name: '伝説の試験装備' },
    { t: 'drop', x: 62, rarity: 5, name: '神話の試験装備' },
  ])]
  const damage = (amount: number, crit: boolean): SimEvent => ({ t: 'damage', uid: target.uid, sourceUid: actor.uid, amount, crit })
  if (mode === 'numbers') return [cue(0, [damage(124, true), damage(16, false), damage(18, false), damage(25, false)]), cue(150, [damage(32, false)]), cue(300, [damage(231, true)])]
  const def = jobs[job]
  if (mode === 'skill' || mode === 'ultimate') return [cue(0, [{ t: mode, uid: actor.uid, skillId: mode === 'skill' ? def.skill.id : def.ultimate.id }]), cue(mode === 'ultimate' ? balance.ultCastMs : 100, [damage(148, true)])]
  const windup = normalWindupMs(), hit = def.attack.kind === 'ranged' ? windup + 300 : windup
  const cues = [cue(0, [{ t: 'attack', uid: actor.uid, targetUid: target.uid, kind: def.attack.kind }], value => { value.units.find(unit => unit.uid === actor.uid)!.action = 'windup' })]
  if (def.attack.kind === 'ranged') for (let at = windup; at < hit; at += balance.tickMs) cues.push(cue(at, [], value => {
      if (!def.attack.projectile) throw new Error(`Missing QA projectile: ${job}`)
      value.projectiles = [{ id: 999, kind: def.attack.projectile, fromUid: actor.uid, toUid: target.uid, launchTick: windup / balance.tickMs, hitTick: hit / balance.tickMs }]
    }))
  cues.push(cue(hit, [damage(24, false)]))
  return cues
}
