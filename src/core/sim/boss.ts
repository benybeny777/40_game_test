import { balance } from '../data/balance.ts'
import type { BossSkill } from '../data/enemies.ts'
import { bossPattern, BOSS_MILESTONE_PHASE_HP } from '../data/bossPatterns.ts'
import { living, opponents } from './combat.ts'
import type { Unit, World } from './types.ts'

export function summonCapacity(world: World, skill: Extract<BossSkill, { kind: 'summon' }>): number {
  const kinds = skill.roster?.map(entry => entry.id) ?? [skill.summon]
  const alive = world.units.filter((unit) => unit.side === 'enemy' && living(unit) && kinds.includes(unit.defId)).length
  return Math.max(0, Math.min(skill.count, skill.maxAlive - alive))
}
export function currentBossPattern(world: World, self: Unit) {
  return bossPattern(self.defId, world.stageNo, world.depthRank, self.hp <= self.stats.maxHp * BOSS_MILESTONE_PHASE_HP)
}
export function bossSkillCandidates(world: World, self: Unit) {
  const skill = currentBossPattern(world, self)?.skill
  const allies = opponents(world, self)
  return skill?.kind === 'frontStrike' ? allies.filter((unit) => Math.abs(unit.x - self.x) <= self.stats.rangeDots + balance.formationGap * (skill.targets - 1)) : allies
}
/** Cooldown is checked by the caller; this is the shared action/target/capacity eligibility. */
export function canStartBossSkill(world: World, self: Unit): boolean {
  return self.action.kind === 'none' && hasBossSkillTargets(world, self)
}
/** Interrupt users may reserve during a short, known remaining movement/windup. */
export function canReserveBossSkill(world: World, self: Unit, windowTicks: number): boolean {
  if (self.action.kind === 'cast') return false
  const readyTick = Math.max(self.skillReadyTick, self.action.kind === 'none' ? world.tick : self.action.untilTick)
  return readyTick <= world.tick + windowTicks && hasBossSkillTargets(world, self)
}
function hasBossSkillTargets(world: World, self: Unit): boolean {
  const skill = self.side === 'enemy' ? currentBossPattern(world, self)?.skill : undefined
  if (!skill || !living(self)) return false
  return skill.kind === 'summon' ? summonCapacity(world, skill) > 0 : bossSkillCandidates(world, self).length > 0
}
