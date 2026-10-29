import { balance } from '../data/balance.ts'
import { enemies, type BossSkill } from '../data/enemies.ts'
import { living, opponents } from './combat.ts'
import type { Unit, World } from './types.ts'

export function summonCapacity(world: World, skill: Extract<BossSkill, { kind: 'summon' }>): number {
  const alive = world.units.filter((unit) => unit.side === 'enemy' && living(unit) && unit.defId === skill.summon).length
  return Math.max(0, Math.min(skill.count, skill.maxAlive - alive))
}
export function bossSkillCandidates(world: World, self: Unit) {
  const skill = enemies[self.defId].boss?.skill
  const allies = opponents(world, self)
  return skill?.kind === 'frontStrike' ? allies.filter((unit) => Math.abs(unit.x - self.x) <= self.stats.rangeDots + balance.formationGap) : allies
}
/** Cooldown is checked by the caller; this is the shared action/target/capacity eligibility. */
export function canStartBossSkill(world: World, self: Unit): boolean {
  const skill = self.side === 'enemy' ? enemies[self.defId].boss?.skill : undefined
  if (!skill || !living(self) || self.action.kind !== 'none') return false
  return skill.kind === 'summon' ? summonCapacity(world, skill) > 0 : bossSkillCandidates(world, self).length > 0
}
