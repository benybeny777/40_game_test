import { dungeonBalance, maxFloor, type Difficulty } from '../core/data/dungeon.ts'
import { enemies } from '../core/data/enemies.ts'
import { bossPattern } from '../core/data/bossPatterns.ts'
import type { JobRole } from '../core/data/jobs.ts'
import { areaOf } from '../core/data/stages.ts'
import { enemyGuide } from './enemyGuide'

/** Follows the same area/boss definitions as wave generation, not a second boss-floor table. */
export function nextBoss(depth: number, difficulty: Difficulty) {
  if (!Number.isSafeInteger(depth) || depth < 1 || depth > maxFloor(difficulty)) throw new RangeError('Invalid boss preview floor')
  const floor = Math.ceil(depth / dungeonBalance.bossEvery) * dungeonBalance.bossEvery
  if (!Number.isSafeInteger(floor) || floor > maxFloor(difficulty)) return null
  const enemyId = areaOf(floor).boss, enemy = enemies[enemyId]
  if (!enemy?.boss) throw new Error(`Missing boss definition: ${enemyId}`)
  const pattern = bossPattern(enemyId, floor, difficulty)!
  const kind = pattern.skill.kind
  const roles: JobRole[] = kind === 'frontStrike' ? ['tank', 'healer', 'debuffer'] : ['attacker', 'healer']
  return { floor, difficulty, enemyId, name: enemy.name, skill: pattern.skill, late: pattern.late, secondPhase: pattern.secondPhase,
    guide: enemyGuide(enemyId, { floor, depthRank: difficulty }), roles,
    areaDamage: kind === 'summon' || Boolean(enemy.boss.phantoms) }
}
