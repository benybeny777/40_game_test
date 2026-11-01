import type { Attributes } from '../data/attributes.ts'
import { balance as b } from '../data/balance.ts'
import { depthScale, dungeonBalance as db, floorFeature, isBossFloor, maxFloor, type Difficulty } from '../data/dungeon.ts'
import { enemies } from '../data/enemies.ts'
import { defaultFormation, jobs, partyOrder, partySize } from '../data/jobs.ts'
import { dojo as dojoDefs } from '../data/progress.ts'
import { areaOf, areas, previousAreaShare, stagesPerArea, waveSizes } from '../data/stages.ts'
import { healUnit, kobanMul, passiveOn, strike } from './actions.ts'
import { attackDef, chooseTarget, living, normalAttackInRange, opponents } from './combat.ts'
import { bossSkillCandidates, canStartBossSkill, summonCapacity, currentBossPattern } from './boss.ts'
import { bossSkillById } from '../data/bossPatterns.ts'
import { random } from './rng.ts'
import { onBattleStart, refreshStats, rollOatari, skills, ultimates } from './skills.ts'
import { computeStats, type DojoLevels } from './stats.ts'
import { ticks } from './time.ts'
import type { GearStats, JobId, Phase, SimEvent, Snapshot, Stats, Unit, World } from './types.ts'

export interface WorldOptions {
  seed?: number; stageNo?: number; level?: number; levels?: Partial<Record<JobId, number>>
  depthRank?: Difficulty; dungeonSeed?: number; eventDepths?: [number, number, number]; order?: readonly JobId[]; dojo?: DojoLevels; allocated?: Partial<Record<JobId, Attributes>>; gear?: Partial<Record<JobId, GearStats[]>>; loop?: boolean; moveBonus?: number; maxStage?: number
}
function makeUnit(world: World, side: Unit['side'], defId: string, slot: number, stats: Stats, x: number, lv: number): Unit {
  return { uid: world.nextId++, side, defId, slot, x, lv, hp: stats.maxHp, stats: { ...stats }, base: { ...stats }, alive: true,
    action: { kind: side === 'enemy' ? 'move' : 'none', untilTick: 0 },
    attackReadyTick: 0, skillReadyTick: 0, ult: 0, gauges: {}, effects: [], aggro: 1 }
}
const walkTicks = (world: World) => ticks(b.walkMs / (1 + world.moveBonus))
const walkRecoveryPerTick = (world: World) => b.walkHealPerSecond * b.tickMs / 1000
  * ticks(b.walkRecoveryMs / (1 + world.moveBonus)) / walkTicks(world)
const validOrder = (order: readonly JobId[]) => order.length === partyOrder.length && partyOrder.every((id) => order.includes(id))

export function createWorld(options: WorldOptions = {}): World {
  const { seed = 1, stageNo = 1, level = 1, levels = {}, order = defaultFormation, dojo = {}, gear = {}, allocated = {}, loop = false, depthRank = 0, maxStage = maxFloor(depthRank) } = options
  if (!Number.isInteger(depthRank) || depthRank < 0 || depthRank > db.maxDifficulty) throw new RangeError('invalid difficulty')
  const moveBonus = options.moveBonus ?? dojoDefs.walk.per * (dojo.walk ?? 0)
  if (!Number.isInteger(seed) || seed < 0 || seed >= b.rng.divisor) throw new RangeError('seed must be uint32')
  if (!Number.isSafeInteger(stageNo) || stageNo < 1 || stageNo > maxStage) throw new RangeError(`stage must be 1..${maxStage}`)
  if (!Number.isFinite(moveBonus) || moveBonus < 0) throw new RangeError('Invalid moveBonus')
  if (!validOrder(order)) throw new RangeError('order must contain each job once')
  const world: World = { tick: 0, rng: seed >>> 0, phase: 'walking', phaseUntilTick: 0,
    stageNo, wave: 1, loop, units: [], reserves: [], projectiles: [], mines: [], nextId: 1, wipeStreak: 0,
    spawnQueue: [], spawnIndex: 0, nextSpawnTick: 0, moveBonus, maxStage, depthRank, dungeonSeed: options.dungeonSeed ?? seed, eventDepths: [...(options.eventDepths ?? [0, 0, 0])], pending: {} }
  world.phaseUntilTick = walkTicks(world)
  world.units = order.map((id, slot) => {
    const lv = levels[id] ?? level
    return makeUnit(world, 'ally', id, slot, computeStats(jobs[id], lv, dojo, gear[id], allocated[id]), 0 - slot * b.formationGap, lv)
  })
  world.reserves = world.units.splice(partySize)
  return world
}

/** Lv/dojo changes from progression. Keeps each ally's HP ratio. */
export function refreshParty(world: World, levels: Partial<Record<JobId, number>>, dojo: DojoLevels = {}, gear: Partial<Record<JobId, GearStats[]>> = {}, allocated: Partial<Record<JobId, Attributes>> = {}) {
  world.moveBonus = dojoDefs.walk.per * (dojo.walk ?? 0)
  for (const unit of [...world.units.filter((candidate) => candidate.side === 'ally'), ...world.reserves]) {
    const lv = levels[unit.defId as JobId] ?? unit.lv
    const ratio = unit.hp / unit.base.maxHp
    unit.lv = lv; unit.base = computeStats(jobs[unit.defId as JobId], lv, dojo, gear[unit.defId as JobId], allocated[unit.defId as JobId])
    refreshStats(world, unit)
    if (unit.alive) unit.hp = Math.max(0, unit.base.maxHp * ratio)
  }
}
/** Applied at the next wave boundary so a running fight is never discarded. */
export function requestStage(world: World, stageNo: number, depthRank: Difficulty = world.depthRank) {
  if (!Number.isInteger(depthRank) || depthRank < 0 || depthRank > db.maxDifficulty || !Number.isSafeInteger(stageNo) || stageNo < 1 || stageNo > maxFloor(depthRank)) throw new RangeError('stage out of range')
  world.pending.stageNo = stageNo; world.pending.depthRank = depthRank
  if (world.phase === 'walking' || world.phase === 'town') { applyPending(world); world.phase = 'walking'; world.phaseUntilTick = world.tick + walkTicks(world) }
}
export function requestOrder(world: World, order: readonly JobId[]) {
  if (!validOrder(order)) throw new RangeError('order must contain each job once')
  world.pending.order = [...order]
  if (world.phase === 'walking' || world.phase === 'town') applyPending(world)
}
function applyPending(world: World) {
  if (world.pending.depthRank !== undefined) { world.depthRank = world.pending.depthRank; world.maxStage = maxFloor(world.depthRank) }
  if (world.pending.stageNo !== undefined) { world.stageNo = world.pending.stageNo; world.wave = 1; world.wipeStreak = 0 }
  if (world.pending.order) {
    const order = world.pending.order
    const allies = [...world.units.filter((unit) => unit.side === 'ally'), ...world.reserves]
      .sort((a, z) => order.indexOf(a.defId as JobId) - order.indexOf(z.defId as JobId))
    allies.forEach((unit, slot) => { unit.slot = slot; unit.x = 0 - slot * b.formationGap })
    world.units = [...allies.slice(0, partySize), ...world.units.filter((unit) => unit.side === 'enemy')]
    world.reserves = allies.slice(partySize)
  }
  world.pending = {}
}

function phase(world: World, next: Phase, ms: number, events: SimEvent[]) {
  world.phase = next
  world.phaseUntilTick = world.tick + ticks(ms)
  events.push({ t: 'phase', phase: next, stageNo: world.stageNo, wave: world.wave, depthRank: world.depthRank })
}
function resetWave(world: World, events: SimEvent[], fullHeal = false) {
  world.units = world.units.filter((unit) => unit.side === 'ally')
  world.projectiles = []; world.mines = []
  for (const unit of [...world.units, ...world.reserves]) {
    delete unit.gauges.wardUsed
    delete unit.gauges.raised
    unit.effects = []; unit.action = { kind: 'none', untilTick: 0 }
    unit.attackReadyTick = world.tick; unit.skillReadyTick = Math.min(unit.skillReadyTick, world.tick)
    if (fullHeal) {
      if (!unit.alive) events.push({ t: 'revive', uid: unit.uid })
      unit.alive = true; unit.gauges = {}; unit.ult = 0
      refreshStats(world, unit); unit.hp = unit.stats.maxHp
    }
    refreshStats(world, unit)
  }
  applyPending(world)
  for (const unit of world.units) unit.x = 0 - unit.slot * b.formationGap
  phase(world, 'walking', b.walkMs / (1 + world.moveBonus), events)
}
function pickWeighted(world: World, entries: ReadonlyArray<{ id: string; weight: number }>) {
  let roll = random(world) * entries.reduce((sum, entry) => sum + entry.weight, 0)
  for (const entry of entries) { roll -= entry.weight; if (roll < 0) return entry.id }
  return entries[entries.length - 1].id
}
function beginSpawning(world: World, events: SimEvent[]) {
  const area = areaOf(world.stageNo), previous = areas[areas.indexOf(area) - 1]
  const size = waveSizes.find((entry) => world.wave <= entry.through)!.count || area.maxWave
  world.spawnQueue = Array.from({ length: size }, () =>
    pickWeighted(world, previous && random(world) < previousAreaShare ? previous.weights : area.weights))
  if (world.wave === b.waves && isBossFloor(world.stageNo)) world.spawnQueue.push(area.boss)
  world.spawnIndex = 0; world.nextSpawnTick = world.tick
  phase(world, 'spawning', 0, events)
}
/** Product of the per-step growth from stage 1 up to stageNo; the rate depends on the area each step starts in. */
export function stageMul(stageNo: number, perArea: readonly number[]) {
  let logarithm = 0
  for (let index = 0; index < perArea.length; index++) {
    const steps = index === perArea.length - 1 ? Math.max(0, stageNo - 1 - index * stagesPerArea)
      : Math.max(0, Math.min(stagesPerArea, stageNo - 1 - index * stagesPerArea))
    logarithm += steps * Math.log(perArea[index])
  }
  return Math.exp(Math.min(Math.log(Number.MAX_SAFE_INTEGER), logarithm))
}
function enemyStats(world: World, id: string): Stats {
  const def = enemies[id], scaling = depthScale(world.stageNo, world.depthRank)
  const introductory = world.depthRank === 0 && world.stageNo === 1
  const waveMul = def.boss ? 1 : 1 + b.waveGrowth * (world.wave - 1)
  const elite = !def.boss && world.wave === b.waves && !isBossFloor(world.stageNo)
  return { ...def.base, maxHp: def.base.maxHp * scaling.hp * waveMul * (def.boss ? db.bossHp : elite ? db.eliteHp : 1) * (introductory ? db.introHp : 1),
    atk: def.base.atk * scaling.atk * waveMul * (def.boss ? db.bossAtk : elite ? db.eliteAtk : 1) * (introductory ? db.introAtk : 1), def: def.base.def * scaling.def }
}
/** Mid-battle spawns (split, summons, phantoms) join at the given x, after everyone already on the field. */
function spawnEnemy(world: World, id: string, x: number, events: SimEvent[], stats = enemyStats(world, id)) {
  const slot = world.units.filter((unit) => unit.side === 'enemy').length
  const unit = makeUnit(world, 'enemy', id, slot, stats, x, 0)
  unit.attackReadyTick = world.tick + ticks(b.windupMs)
  world.units.push(unit); events.push({ t: 'spawn', uid: unit.uid })
  return unit
}
function resolveFloorFeature(world: World, events: SimEvent[]) {
  if (world.wave !== 1 || world.stageNo <= world.eventDepths[world.depthRank]) return
  const kind = floorFeature(world.stageNo, world.dungeonSeed, world.depthRank)
  if (kind === 'none') return
  world.eventDepths[world.depthRank] = world.stageNo
  events.push({ t: 'floorEvent', kind, stageNo: world.stageNo, depthRank: world.depthRank })
  if (kind === 'treasure') {
    const mul = depthScale(world.stageNo, world.depthRank).reward
    events.push({ t: 'reward', koban: Math.floor(db.treasureKoban * mul), exp: Math.floor(db.treasureExp * mul), enemyId: 'treasure', x: 0, stageNo: world.stageNo })
  } else for (const unit of world.units.filter((ally) => ally.side === 'ally' && living(ally))) healUnit(unit, unit.stats.maxHp * db.altarHeal, unit.uid, events)
}
export function returnToTown(world: World, events: SimEvent[] = []) {
  delete world.pending.stageNo; delete world.pending.depthRank
  world.wave = 1; world.wipeStreak = 0; world.spawnQueue = []; world.spawnIndex = 0
  resetWave(world, events, true)
  phase(world, 'town', 0, events)
  return events
}
function phaseStep(world: World, events: SimEvent[]) {
  if (world.tick >= world.phaseUntilTick) {
    switch (world.phase) {
      case 'walking':
        resolveFloorFeature(world, events)
        if (world.wave === b.waves && isBossFloor(world.stageNo)) phase(world, 'bossIntro', b.bossIntroMs, events)
        else beginSpawning(world, events)
        break
      case 'bossIntro': beginSpawning(world, events); break
      case 'waveClear':
        if (world.wave === b.waves) { world.wipeStreak = 0; phase(world, 'stageClear', b.stageClearMs, events) }
        else { world.wave++; resetWave(world, events) }
        break
      case 'stageClear':
        if (!world.loop) {
          if (world.stageNo < world.maxStage) world.stageNo++
          else if (world.depthRank < db.maxDifficulty) { world.depthRank = (world.depthRank + 1) as Difficulty; world.maxStage = maxFloor(world.depthRank); world.stageNo = 1 }
          else world.loop = true
        }
        world.wave = 1; resetWave(world, events)
        break
      case 'wipe': world.wave = 1; resetWave(world, events, true); break
    }
  }
  if (world.phase === 'walking' && world.tick < world.phaseUntilTick) {
    const recovery = walkRecoveryPerTick(world)
    for (const unit of world.units.filter(living)) healUnit(unit, unit.stats.maxHp * recovery, unit.uid, events)
  }
  if (world.phase === 'spawning' && world.tick >= world.nextSpawnTick) {
    const id = world.spawnQueue[world.spawnIndex]
    const unit = makeUnit(world, 'enemy', id, world.spawnIndex, enemyStats(world, id), b.spawnX + world.spawnIndex * b.enemyGap, 0)
    world.units.push(unit); events.push({ t: 'spawn', uid: unit.uid })
    world.spawnIndex++; world.nextSpawnTick += ticks(b.spawnMs)
    if (world.spawnIndex === world.spawnQueue.length) { phase(world, 'battle', 0, events); onBattleStart(world, events) }
  }
}
/** Advance the formation in world space; rear members retain their protected distance. */
function moveAllies(world: World) {
  const allies = world.units.filter(unit => unit.side === 'ally' && living(unit)).sort((a, z) => a.slot - z.slot)
  for (const unit of allies) if (unit.action.kind === 'move') unit.action = { kind: 'none', untilTick: 0 }
  const front = allies[0], melee = allies.filter(unit => attackDef(unit).kind === 'melee')
  if (!front || !melee.length || front.action.kind === 'windup' || front.action.kind === 'cast') return
  const foes = opponents(world, front)
  if (!foes.length) return
  const nearest = foes.reduce((a, z) => a.x < z.x ? a : z)
  // Meet an approaching foe at the existing defensive line. Stationary
  // ranged/casting foes still require a real advance instead of an endless wait.
  if (enemies[nearest.defId].speed > 0 && nearest.action.kind === 'move') return
  // Close enough for the shortest-reach melee member, without crossing an enemy.
  const gap = nearest.x - front.x - Math.min(...melee.map(unit => unit.stats.rangeDots))
  if (gap <= 0) return
  const distance = Math.min(gap, b.allyAdvanceDotsPerSecond * b.tickMs / 1000)
  for (const unit of world.units.filter(unit => unit.side === 'ally')) {
    unit.x += distance
    if (living(unit) && unit.action.kind === 'none') unit.action = { kind: 'move', untilTick: 0 }
  }
}
function moveEnemies(world: World, events: SimEvent[]) {
  const front = world.units.find((unit) => unit.side === 'ally' && living(unit))
  if (!front) return
  const melee = world.units.filter((unit) => unit.side === 'enemy' && living(unit) && attackDef(unit).kind === 'melee')
  for (const unit of world.units.filter((candidate) => candidate.side === 'enemy' && living(candidate))) {
    const stopX = attackDef(unit).kind === 'melee' ? front.x + b.enemyStop + melee.indexOf(unit) * b.enemyGap : front.x + unit.stats.rangeDots
    if (unit.action.kind === 'windup' || unit.action.kind === 'cast') { explodeIfArrived(world, unit, stopX, events); continue }
    if (unit.x > stopX) {
      unit.x = Math.max(stopX, unit.x - enemies[unit.defId].speed * b.tickMs / 1000)
      unit.action = unit.x > stopX
        ? { kind: 'move', untilTick: world.tick + (enemies[unit.defId].speed > 0 ? ticks((unit.x - stopX) / enemies[unit.defId].speed * 1000) : Number.MAX_SAFE_INTEGER) }
        : { kind: 'none', untilTick: 0 }
    } else if (unit.action.kind === 'move') unit.action = { kind: 'none', untilTick: 0 }
    explodeIfArrived(world, unit, stopX, events)
  }
}
/** ポップアップ鬼: reaching the front line detonates on the first allies (unavoidable), then it is gone. */
function explodeIfArrived(world: World, unit: Unit, stopX: number, events: SimEvent[]) {
  const explode = enemies[unit.defId].traits.explode
  if (!explode || unit.x > stopX || !living(unit)) return
  events.push({ t: 'explode', x: unit.x, radius: b.formationGap })
  const targets = world.units.filter((ally) => ally.side === 'ally' && living(ally)).slice(0, explode.targets)
  for (const target of targets) strike(world, unit, target, { mul: explode.mul, aoeDots: b.formationGap, tags: ['explode'] }, events)
  unit.hp = 0; unit.action = { kind: 'none', untilTick: 0 }
}
function resolveProjectilesAndMines(world: World, events: SimEvent[]) {
  const due = world.projectiles.filter((projectile) => projectile.hitTick <= world.tick)
  world.projectiles = world.projectiles.filter((projectile) => projectile.hitTick > world.tick)
  for (const projectile of due) {
    const owner = world.units.find((unit) => unit.uid === projectile.ownerUid)
    if (!owner) continue
    let target = world.units.find((unit) => unit.uid === projectile.targetUid && living(unit))
    if (!target) target = opponents(world, owner).sort((a, z) => Math.abs(a.x - owner.x) - Math.abs(z.x - owner.x))[0]
    if (target) strike(world, owner, target, projectile.payload, events)
  }
  for (const mine of [...world.mines]) {
    const owner = world.units.find((unit) => unit.uid === mine.ownerUid)
    const stepped = world.tick >= mine.armTick && world.units.some((unit) => unit.side === 'enemy' && living(unit) && Math.abs(unit.x - mine.x) <= b.mineTriggerDots)
    if (!owner || !(stepped || world.tick >= mine.explodeTick)) continue
    world.mines = world.mines.filter((current) => current !== mine)
    const radius = mine.payload.aoeDots ?? b.mineRadiusDots
    events.push({ t: 'explode', x: mine.x, radius })
    for (const target of opponents(world, owner).filter((unit) => Math.abs(unit.x - mine.x) <= radius)) strike(world, owner, target, mine.payload, events)
  }
}
function decide(world: World, unit: Unit, events: SimEvent[]) {
  const ctx = { world, self: unit, events }
  if (unit.side === 'ally') {
    const job = jobs[unit.defId as JobId]
    if (unit.lv >= b.ultLv && unit.ult >= b.maxGauge && opponents(world, unit).length) {
      const roll = job.ultimate.id === 'oatari' ? rollOatari(world, unit) : undefined
      unit.ult = 0
      unit.action = { kind: 'cast', untilTick: world.tick + ticks(b.ultCastMs), skillId: job.ultimate.id, roll }
      events.push({ t: 'ultimate', uid: unit.uid, skillId: job.ultimate.id, roll })
      return
    }
    const skill = skills[job.skill.id]
    if (unit.lv >= b.skillLv && unit.skillReadyTick <= world.tick && skill.canUse(ctx)) {
      skill.use(ctx)
      unit.skillReadyTick = world.tick + ticks((job.skill.cooldownMs ?? 0) * unit.stats.cooldownMul)
      events.push({ t: 'skill', uid: unit.uid, skillId: job.skill.id })
      return
    }
  } else {
    const boss = enemies[unit.defId].boss
    if (boss && unit.skillReadyTick <= world.tick && bossSkill(world, unit, events)) {
      unit.skillReadyTick = world.tick + ticks(currentBossPattern(world, unit)!.skill.cooldownMs)
      unit.attackReadyTick = world.tick + ticks(unit.stats.intervalMs)
      return
    }
  }
  if (unit.attackReadyTick > world.tick || (unit.side === 'enemy' && enemies[unit.defId].traits.explode)) return
  const target = chooseTarget(world, unit)
  if (!target) return
  unit.action = { kind: 'windup', untilTick: world.tick + ticks(b.windupMs), targetUid: target.uid }
  unit.attackReadyTick = world.tick + ticks(unit.stats.intervalMs)
  events.push({ t: 'attack', uid: unit.uid, targetUid: target.uid, kind: attackDef(unit).kind })
}
function finishActions(world: World, events: SimEvent[]) {
  for (const unit of world.units) {
    if (!living(unit) || (unit.action.kind !== 'windup' && unit.action.kind !== 'cast') || unit.action.untilTick > world.tick) continue
    const action = unit.action
    unit.action = { kind: 'none', untilTick: 0 }
    if (action.kind === 'cast') {
      if (unit.side === 'enemy') resolveBossSkill(world, unit, action, events)
      else ultimates[action.skillId!]({ world, self: unit, events }, action.roll)
      continue
    }
    // A slain windup target must not consume an entire attack cycle. Retarget only
    // within normal reach; no movement, extra strike, or pursuit occurs here.
    const target = world.units.find((candidate) => candidate.uid === action.targetUid && living(candidate))
      ?? chooseTarget(world, unit)
    if (!target) continue
    const attack = attackDef(unit)
    const iai = unit.effects.find((effect) => effect.kind === 'nextCrit')
    if (attack.kind === 'melee') {
      if (!normalAttackInRange(world, unit, target)) continue
      if (iai) { unit.effects = unit.effects.filter((effect) => effect !== iai); events.push({ t: 'effect', uid: unit.uid, tag: iai.tag, on: false }) }
      if (unit.side === 'enemy' && enemies[unit.defId].traits.double) {
        // 化け猫: two half-strength swipes.
        strike(world, unit, target, { mul: attack.mul * b.doubleHitMul }, events)
        if (living(target)) strike(world, unit, target, { mul: attack.mul * b.doubleHitMul }, events)
      } else strike(world, unit, target, iai ? { mul: iai.value, forceCrit: true, tags: ['iai'] } : { mul: attack.mul }, events)
    } else {
      const shots = unit.defId === 'pachipro' ? b.shotsMin + Math.floor(random(world) * (b.shotsMax - b.shotsMin + 1)) : 1
      for (let index = 0; index < shots; index++) world.projectiles.push({ id: world.nextId++, ownerUid: unit.uid, targetUid: target.uid,
        launchTick: world.tick, hitTick: world.tick + Math.max(1, ticks(Math.abs(target.x - unit.x) / b.projectileDotsPerSecond * 1000)),
        kind: attack.projectile!, payload: { mul: attack.mul } })
    }
  }
}
function settle(world: World, events: SimEvent[]) {
  for (const unit of [...world.units]) {
    const def = unit.side === 'enemy' ? enemies[unit.defId] : undefined
    const phantoms = def?.boss?.phantoms
    if (def && phantoms && living(unit) && !unit.gauges.phantoms && unit.hp / unit.stats.maxHp <= phantoms.atHp) {
      // 電脳九尾: once, at half HP, splits off phantoms that only attack.
      unit.gauges.phantoms = 1
      events.push({ t: 'skill', uid: unit.uid, skillId: 'phantom' })
      for (let index = 0; index < phantoms.count; index++) {
        spawnEnemy(world, phantoms.id, unit.x + (index + 1) * b.enemyGap, events, { ...unit.base, maxHp: unit.base.maxHp * phantoms.hpRatio, def: 0 })
      }
    }
    if (!unit.alive || unit.hp > 0) continue
    if (passiveOn(unit, 'jiangshi') && !unit.gauges.raised) {
      unit.gauges.raised = 1; unit.hp = unit.stats.maxHp * jobs.jiangshi.passive.params.heal
      unit.action = { kind: 'none', untilTick: 0 }
      events.push({ t: 'revive', uid: unit.uid })
      continue
    }
    unit.alive = false; unit.action = { kind: 'none', untilTick: 0 }; events.push({ t: 'death', uid: unit.uid })
    if (!def) continue
    const rewardMul = depthScale(world.stageNo, world.depthRank).reward
    if (def.exp || def.koban) events.push({ t: 'reward', koban: Math.floor(def.koban * rewardMul * kobanMul(world)), exp: Math.floor(def.exp * rewardMul), enemyId: unit.defId, x: unit.x, stageNo: world.stageNo })
    if (def.traits.split) {
      // バグ精霊: the first death splits into two smaller pieces at the same spot.
      const child = enemyStats(world, def.traits.split.child)
      for (const offset of [0, b.enemyGap]) spawnEnemy(world, def.traits.split.child, unit.x + offset, events, { ...child, maxHp: unit.stats.maxHp * def.traits.split.hpRatio })
    }
  }
  if (!world.units.some((unit) => unit.side === 'ally' && living(unit))) {
    world.wipeStreak++; if (world.wipeStreak >= b.wipeLoopThreshold) world.loop = true
    phase(world, 'wipe', b.wipeMs, events)
  } else if (!world.units.some((unit) => unit.side === 'enemy' && living(unit))) {
    for (const unit of world.units.filter((ally) => ally.side === 'ally')) {
      if (!unit.alive) { unit.alive = true; unit.hp = 0; events.push({ t: 'revive', uid: unit.uid }) }
      if (unit.hp <= 0) { unit.hp = unit.stats.maxHp * b.clearHeal; continue }
      healUnit(unit, unit.stats.maxHp * b.clearHeal, unit.uid, events)
    }
    world.projectiles = []; world.mines = []
    phase(world, 'waveClear', b.waveClearMs, events)
  }
}
function shuffle<T>(world: World, list: readonly T[]) {
  const copy = [...list]
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random(world) * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy
}
/** Lock visible targets before charging. Guard, debuffs, burst and displacement are distinct counters. */
function bossSkill(world: World, self: Unit, events: SimEvent[]): boolean {
  const skill = currentBossPattern(world, self)?.skill
  if (!skill || !canStartBossSkill(world, self)) return false
  const allies = bossSkillCandidates(world, self)
  const targets = skill.kind === 'summon' ? [] : skill.kind === 'frontStrike'
    ? allies.slice(0, skill.targets)
    : skill.kind === 'rearStrike' ? [...allies].sort((a, b) => b.slot - a.slot).slice(0, skill.targets)
    : shuffle(world, allies).slice(0, skill.targets)
  if (skill.kind !== 'summon' && !targets.length) return false
  const targetUids = targets.map((unit) => unit.uid)
  const resolveTick = world.tick + ticks(skill.castMs)
  self.action = { kind: 'cast', untilTick: resolveTick, skillId: skill.id, targetUids, originX: self.x }
  events.push({ t: 'bossTell', uid: self.uid, skillId: skill.id, targetUids: [...targetUids], resolveTick })
  return true
}
function resolveBossSkill(world: World, self: Unit, action: Unit['action'], events: SimEvent[]) {
  const skill = bossSkillById(self.defId, action.skillId!)
  if (!skill) throw new Error(`Unknown boss action: ${self.defId}/${action.skillId}`)
  // Harite and the sumo ultimate can break a charge. The cooldown was already spent.
  if (Math.abs(self.x - action.originX!) >= b.bossInterruptDots) {
    events.push({ t: 'bossInterrupt', uid: self.uid, skillId: skill.id, sourceUid: action.interruptSource?.uid, interruptSkillId: action.interruptSource?.skillId })
    return
  }
  events.push({ t: 'skill', uid: self.uid, skillId: skill.id })
  if (skill.kind === 'summon') {
    const count = summonCapacity(world, skill)
    for (let index = 0; index < count; index++) {
      const entry = skill.roster ? skill.roster[index % skill.roster.length] : { id: skill.summon, atkMul: 1 }
      if (!entry) throw new Error(`Empty boss summon roster: ${skill.id}`)
      const stats = enemyStats(world, entry.id)
      spawnEnemy(world, entry.id, self.x + (index + 1) * b.enemyGap, events, { ...stats, atk: stats.atk * entry.atkMul })
    }
    return
  }
  const targets = world.units.filter((unit) => living(unit) && action.targetUids!.includes(unit.uid)
    && (skill.kind !== 'frontStrike' || Math.abs(unit.x - self.x) <= self.stats.rangeDots + b.formationGap * (skill.targets - 1)))
  for (const target of targets) strike(world, self, target, { mul: skill.mul, tags: [skill.id] }, events)
}
function battleStep(world: World, events: SimEvent[]) {
  moveAllies(world)
  moveEnemies(world, events)
  resolveProjectilesAndMines(world, events)
  for (const unit of world.units) if (living(unit) && (unit.action.kind === 'none' || (unit.side === 'ally' && unit.action.kind === 'move'))) decide(world, unit, events)
  finishActions(world, events)
  settle(world, events)
}
export function step(world: World, commands: readonly never[] = []): SimEvent[] {
  if (commands.length) throw new Error('Commands are introduced in M5')
  const events: SimEvent[] = []
  for (const unit of [...world.units, ...world.reserves]) {
    const expired = unit.effects.filter((effect) => effect.untilTick <= world.tick)
    for (const effect of expired) events.push({ t: 'effect', uid: unit.uid, tag: effect.tag, on: false })
    if (expired.length) unit.effects = unit.effects.filter((effect) => effect.untilTick > world.tick)
    refreshStats(world, unit)
  }
  phaseStep(world, events)
  if (world.phase === 'battle') battleStep(world, events)
  world.tick++
  return events
}
export function snapshot(world: World, koban = 0): Snapshot {
  return { tick: world.tick, phase: world.phase, stageNo: world.stageNo, depthRank: world.depthRank, wave: world.wave, koban, loop: world.loop,
    units: world.units.map((unit) => {
      const cooldown = unit.side === 'ally' ? ticks((jobs[unit.defId as JobId].skill.cooldownMs ?? 0) * unit.stats.cooldownMul) : 0
      return { uid: unit.uid, side: unit.side, defId: unit.defId, slot: unit.slot, x: unit.x, lv: unit.lv,
        hp: Math.max(0, unit.hp), maxHp: unit.stats.maxHp, hpRatio: Math.max(0, Math.min(1, unit.hp / unit.stats.maxHp)), alive: unit.alive,
        action: unit.action.kind, ult: unit.ult, ultOn: unit.lv >= b.ultLv, jonen: unit.gauges.jonen,
        skillRemainingMs: Math.max(0, unit.skillReadyTick - world.tick) * b.tickMs,
        skillReady: cooldown ? Math.max(0, Math.min(1, 1 - (unit.skillReadyTick - world.tick) / cooldown)) : 1,
        effects: unit.effects.map((effect) => effect.tag),
        bossCast: unit.side === 'enemy' && unit.action.kind === 'cast'
          ? { skillId: unit.action.skillId!, targetUids: [...unit.action.targetUids!], resolveTick: unit.action.untilTick } : undefined }
    }),
    projectiles: world.projectiles.map((projectile) => ({ id: projectile.id, kind: projectile.kind, fromUid: projectile.ownerUid, toUid: projectile.targetUid, launchTick: projectile.launchTick, hitTick: projectile.hitTick })),
    mines: world.mines.map(({ id, x, explodeTick }) => ({ id, x, explodeTick })) }
}
