import { balance as b } from '../data/balance.ts'
import { enemies } from '../data/enemies.ts'
import { jobs, partyOrder } from '../data/jobs.ts'
import { dojo as dojoDefs } from '../data/progress.ts'
import { areaOf, areas, previousAreaShare, stagesPerArea, waveSizes } from '../data/stages.ts'
import { healUnit, kobanMul, strike } from './actions.ts'
import { attackDef, chooseTarget, living, opponents } from './combat.ts'
import { random } from './rng.ts'
import { onBattleStart, refreshStats, rollOatari, skills, ultimates } from './skills.ts'
import { computeStats, type DojoLevels } from './stats.ts'
import { ticks } from './time.ts'
import type { GearStats, JobId, Phase, SimEvent, Snapshot, Stats, Unit, World } from './types.ts'

export interface WorldOptions {
  seed?: number; stageNo?: number; level?: number; levels?: Partial<Record<JobId, number>>
  order?: readonly JobId[]; dojo?: DojoLevels; gear?: Partial<Record<JobId, GearStats[]>>; loop?: boolean; moveBonus?: number; maxStage?: number
}
function makeUnit(world: World, side: Unit['side'], defId: string, slot: number, stats: Stats, x: number, lv: number): Unit {
  return { uid: world.nextId++, side, defId, slot, x, lv, hp: stats.maxHp, stats: { ...stats }, base: { ...stats }, alive: true,
    action: { kind: side === 'enemy' ? 'move' : 'none', untilTick: 0 },
    attackReadyTick: 0, skillReadyTick: 0, ult: 0, gauges: {}, effects: [], aggro: 1 }
}
const walkTicks = (world: World) => ticks(b.walkMs / (1 + world.moveBonus))
const validOrder = (order: readonly JobId[]) => order.length === partyOrder.length && partyOrder.every((id) => order.includes(id))

export function createWorld(options: WorldOptions = {}): World {
  const { seed = 1, stageNo = 1, level = 1, levels = {}, order = partyOrder, dojo = {}, gear = {}, loop = false, maxStage = b.maxStage } = options
  const moveBonus = options.moveBonus ?? dojoDefs.walk.per * (dojo.walk ?? 0)
  if (!Number.isInteger(seed) || seed < 0 || seed >= b.rng.divisor) throw new RangeError('seed must be uint32')
  if (!Number.isInteger(stageNo) || stageNo < 1 || stageNo > maxStage) throw new RangeError(`stage must be 1..${maxStage}`)
  if (!Number.isFinite(moveBonus) || moveBonus < 0) throw new RangeError('Invalid moveBonus')
  if (!validOrder(order)) throw new RangeError('order must contain each job once')
  const world: World = { tick: 0, rng: seed >>> 0, phase: 'walking', phaseUntilTick: 0,
    stageNo, wave: 1, loop, units: [], projectiles: [], mines: [], nextId: 1, wipeStreak: 0,
    spawnQueue: [], spawnIndex: 0, nextSpawnTick: 0, moveBonus, maxStage, pending: {} }
  world.phaseUntilTick = walkTicks(world)
  world.units = order.map((id, slot) => {
    const lv = levels[id] ?? level
    return makeUnit(world, 'ally', id, slot, computeStats(jobs[id], lv, dojo, gear[id]), 0 - slot * b.formationGap, lv)
  })
  return world
}

/** Lv/dojo changes from progression. Keeps each ally's HP ratio. */
export function refreshParty(world: World, levels: Partial<Record<JobId, number>>, dojo: DojoLevels = {}, gear: Partial<Record<JobId, GearStats[]>> = {}) {
  world.moveBonus = dojoDefs.walk.per * (dojo.walk ?? 0)
  for (const unit of world.units.filter((candidate) => candidate.side === 'ally')) {
    const lv = levels[unit.defId as JobId] ?? unit.lv
    const ratio = unit.hp / unit.base.maxHp
    unit.lv = lv; unit.base = computeStats(jobs[unit.defId as JobId], lv, dojo, gear[unit.defId as JobId])
    refreshStats(world, unit)
    if (unit.alive) unit.hp = Math.max(1, unit.base.maxHp * ratio)
  }
}
/** Applied at the next wave boundary so a running fight is never discarded. */
export function requestStage(world: World, stageNo: number) {
  if (!Number.isInteger(stageNo) || stageNo < 1 || stageNo > world.maxStage) throw new RangeError('stage out of range')
  world.pending.stageNo = stageNo
  if (world.phase === 'walking') { applyPending(world); world.phaseUntilTick = world.tick + walkTicks(world) }
}
export function requestOrder(world: World, order: readonly JobId[]) {
  if (!validOrder(order)) throw new RangeError('order must contain each job once')
  world.pending.order = [...order]
  if (world.phase === 'walking') applyPending(world)
}
function applyPending(world: World) {
  if (world.pending.stageNo !== undefined) { world.stageNo = world.pending.stageNo; world.wave = 1; world.wipeStreak = 0 }
  if (world.pending.order) {
    const order = world.pending.order
    world.units.sort((a, z) => order.indexOf(a.defId as JobId) - order.indexOf(z.defId as JobId))
    world.units.forEach((unit, slot) => { unit.slot = slot; unit.x = 0 - slot * b.formationGap })
  }
  world.pending = {}
}

function phase(world: World, next: Phase, ms: number, events: SimEvent[]) {
  world.phase = next
  world.phaseUntilTick = world.tick + ticks(ms)
  events.push({ t: 'phase', phase: next, stageNo: world.stageNo, wave: world.wave })
}
function resetWave(world: World, events: SimEvent[], fullHeal = false) {
  world.units = world.units.filter((unit) => unit.side === 'ally')
  world.projectiles = []; world.mines = []
  for (const unit of world.units) {
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
  if (world.wave === b.waves) world.spawnQueue.push(area.boss)
  world.spawnIndex = 0; world.nextSpawnTick = world.tick
  phase(world, 'spawning', 0, events)
}
/** Product of the per-step growth from stage 1 up to stageNo; the rate depends on the area each step starts in. */
export function stageMul(stageNo: number, perArea: readonly number[]) {
  let mul = 1
  for (let stage = 1; stage < stageNo; stage++) mul *= perArea[Math.min(perArea.length - 1, Math.floor((stage - 1) / stagesPerArea))]
  return mul
}
function enemyStats(world: World, id: string): Stats {
  const def = enemies[id]
  const waveMul = def.boss ? 1 : 1 + b.waveGrowth * (world.wave - 1)
  return { ...def.base, maxHp: def.base.maxHp * stageMul(world.stageNo, b.stageHpGrowth) * waveMul,
    atk: def.base.atk * stageMul(world.stageNo, b.stageAtkGrowth) * waveMul, def: def.base.def * b.stageDefGrowth ** (world.stageNo - 1) }
}
/** Mid-battle spawns (split, summons, phantoms) join at the given x, after everyone already on the field. */
function spawnEnemy(world: World, id: string, x: number, events: SimEvent[], stats = enemyStats(world, id)) {
  const slot = world.units.filter((unit) => unit.side === 'enemy').length
  const unit = makeUnit(world, 'enemy', id, slot, stats, x, 0)
  unit.attackReadyTick = world.tick + ticks(b.windupMs)
  world.units.push(unit); events.push({ t: 'spawn', uid: unit.uid })
  return unit
}
function phaseStep(world: World, events: SimEvent[]) {
  if (world.tick >= world.phaseUntilTick) {
    switch (world.phase) {
      case 'walking':
        if (world.wave === b.waves) phase(world, 'bossIntro', b.bossIntroMs, events)
        else beginSpawning(world, events)
        break
      case 'bossIntro': beginSpawning(world, events); break
      case 'waveClear':
        if (world.wave === b.waves) { world.wipeStreak = 0; phase(world, 'stageClear', b.stageClearMs, events) }
        else { world.wave++; resetWave(world, events) }
        break
      case 'stageClear':
        // The last implemented stage turns into a farming loop instead of stopping.
        if (!world.loop && world.stageNo >= world.maxStage) world.loop = true
        if (!world.loop) world.stageNo++
        world.wave = 1; resetWave(world, events)
        break
      case 'wipe': world.wave = 1; resetWave(world, events, true); break
    }
  }
  if (world.phase === 'walking' && world.tick < world.phaseUntilTick) {
    for (const unit of world.units.filter(living)) healUnit(unit, unit.stats.maxHp * b.walkHealPerSecond * b.tickMs / 1000, unit.uid, events)
  }
  if (world.phase === 'spawning' && world.tick >= world.nextSpawnTick) {
    const id = world.spawnQueue[world.spawnIndex]
    const unit = makeUnit(world, 'enemy', id, world.spawnIndex, enemyStats(world, id), b.spawnX + world.spawnIndex * b.enemyGap, 0)
    world.units.push(unit); events.push({ t: 'spawn', uid: unit.uid })
    world.spawnIndex++; world.nextSpawnTick += ticks(b.spawnMs)
    if (world.spawnIndex === world.spawnQueue.length) { phase(world, 'battle', 0, events); onBattleStart(world, events) }
  }
}
function moveEnemies(world: World, events: SimEvent[]) {
  const front = world.units.find((unit) => unit.side === 'ally' && living(unit))
  if (!front) return
  const melee = world.units.filter((unit) => unit.side === 'enemy' && living(unit) && attackDef(unit).kind === 'melee')
  for (const unit of world.units.filter((candidate) => candidate.side === 'enemy' && living(candidate))) {
    const stopX = attackDef(unit).kind === 'melee' ? front.x + b.enemyStop + melee.indexOf(unit) * b.enemyGap : front.x + unit.stats.rangeDots
    if (unit.action.kind === 'windup') { explodeIfArrived(world, unit, stopX, events); continue }
    if (unit.x > stopX) {
      unit.x = Math.max(stopX, unit.x - enemies[unit.defId].speed * b.tickMs / 1000)
      unit.action = { kind: unit.x > stopX ? 'move' : 'none', untilTick: 0 }
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
      unit.skillReadyTick = world.tick + ticks(boss.skill.cooldownMs)
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
    if (action.kind === 'cast') { ultimates[action.skillId!]({ world, self: unit, events }, action.roll); continue }
    const target = world.units.find((candidate) => candidate.uid === action.targetUid && living(candidate))
    if (!target) continue
    const attack = attackDef(unit)
    const iai = unit.effects.find((effect) => effect.kind === 'nextCrit')
    if (attack.kind === 'melee') {
      if (Math.abs(unit.x - target.x) > unit.stats.rangeDots) continue
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
    unit.alive = false; unit.action = { kind: 'none', untilTick: 0 }; events.push({ t: 'death', uid: unit.uid })
    if (!def) continue
    const rewardMul = b.rewardGrowth ** (world.stageNo - 1)
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
/** Boss skills fire instead of a normal attack when ready. Returns false when nothing could be done. */
function bossSkill(world: World, self: Unit, events: SimEvent[]): boolean {
  const skill = enemies[self.defId].boss?.skill
  if (!skill) return false
  if (skill.kind === 'summon') {
    const alive = world.units.filter((unit) => unit.side === 'enemy' && living(unit) && unit.defId === skill.summon).length
    const count = Math.min(skill.count, skill.maxAlive - alive)
    if (count <= 0) return false
    events.push({ t: 'skill', uid: self.uid, skillId: skill.id })
    for (let index = 0; index < count; index++) spawnEnemy(world, skill.summon, self.x + (index + 1) * b.enemyGap, events)
    return true
  }
  const allies = world.units.filter((unit) => unit.side === 'ally' && living(unit))
  const targets = skill.kind === 'frontStrike'
    ? allies.filter((unit) => Math.abs(unit.x - self.x) <= self.stats.rangeDots + b.formationGap).slice(0, skill.targets)
    : shuffle(world, allies).slice(0, skill.targets)
  if (!targets.length) return false
  events.push({ t: 'skill', uid: self.uid, skillId: skill.id })
  for (const target of targets) strike(world, self, target, { mul: skill.mul, tags: [skill.id] }, events)
  return true
}
function battleStep(world: World, events: SimEvent[]) {
  moveEnemies(world, events)
  resolveProjectilesAndMines(world, events)
  for (const unit of world.units) if (living(unit) && unit.action.kind === 'none') decide(world, unit, events)
  finishActions(world, events)
  settle(world, events)
}
export function step(world: World, commands: readonly never[] = []): SimEvent[] {
  if (commands.length) throw new Error('Commands are introduced in M5')
  const events: SimEvent[] = []
  for (const unit of world.units) {
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
  return { tick: world.tick, phase: world.phase, stageNo: world.stageNo, wave: world.wave, koban, loop: world.loop,
    units: world.units.map((unit) => {
      const cooldown = unit.side === 'ally' ? ticks(jobs[unit.defId as JobId].skill.cooldownMs ?? 0) : 0
      return { uid: unit.uid, side: unit.side, defId: unit.defId, slot: unit.slot, x: unit.x, lv: unit.lv,
        hp: Math.max(0, unit.hp), maxHp: unit.stats.maxHp, hpRatio: Math.max(0, Math.min(1, unit.hp / unit.stats.maxHp)), alive: unit.alive,
        action: unit.action.kind, ult: unit.ult, ultOn: unit.lv >= b.ultLv, jonen: unit.gauges.jonen,
        skillReady: cooldown ? Math.max(0, Math.min(1, 1 - (unit.skillReadyTick - world.tick) / cooldown)) : 1,
        effects: unit.effects.map((effect) => effect.tag) }
    }),
    projectiles: world.projectiles.map((projectile) => ({ id: projectile.id, kind: projectile.kind, fromUid: projectile.ownerUid, toUid: projectile.targetUid, launchTick: projectile.launchTick, hitTick: projectile.hitTick })),
    mines: world.mines.map(({ id, x, explodeTick }) => ({ id, x, explodeTick })) }
}
