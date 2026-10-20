import { balance as b } from '../data/balance.ts'
import { enemies } from '../data/enemies.ts'
import { jobs, partyOrder } from '../data/jobs.ts'
import { areaOneWeights, waveSizes } from '../data/stages.ts'
import { attackDef, chooseTarget, living, resolveHit } from './combat.ts'
import { random } from './rng.ts'
import { computeStats, withEffects } from './stats.ts'
import type { HitPayload, Phase, SimEvent, Snapshot, Stats, Unit, World } from './types.ts'

const ticks = (ms: number) => Math.ceil(ms / b.tickMs)
function makeUnit(world: World, side: Unit['side'], defId: string, slot: number, stats: Stats, x: number): Unit {
  return { uid: world.nextId++, side, defId, slot, x, hp: stats.maxHp, stats: { ...stats }, base: { ...stats }, alive: true,
    action: { kind: side === 'enemy' ? 'move' : 'none', untilTick: 0 },
    attackReadyTick: 0, skillReadyTick: 0, ult: 0, gauges: {}, effects: [], aggro: 1 }
}
export function createWorld(options: { seed?: number; stageNo?: number; level?: number; loop?: boolean; moveBonus?: number } = {}): World {
  const { seed = 1, stageNo = 1, level = 1, loop = false, moveBonus = 0 } = options
  if (!Number.isInteger(seed) || seed < 0 || seed >= b.rng.divisor) throw new RangeError('seed must be uint32')
  if (!Number.isInteger(stageNo) || stageNo < 1 || stageNo > b.maxStage) throw new RangeError('M1 supports stages 1..5')
  if (!Number.isInteger(level) || level < 1 || level > b.maxLevel || !Number.isFinite(moveBonus) || moveBonus < 0) throw new RangeError('Invalid level/moveBonus')
  const world: World = { tick: 0, rng: seed >>> 0, phase: 'walking', phaseUntilTick: ticks(b.walkMs / (1 + moveBonus)),
    stageNo, wave: 1, loop, units: [], projectiles: [], mines: [], nextId: 1, wipeStreak: 0,
    spawnQueue: [], spawnIndex: 0, nextSpawnTick: 0, moveBonus }
  world.units = partyOrder.map((id, slot) => makeUnit(world, 'ally', id, slot, computeStats(jobs[id], level), 0 - slot * b.formationGap))
  return world
}
function phase(world: World, next: Phase, ms: number, events: SimEvent[]) {
  world.phase = next
  world.phaseUntilTick = world.tick + ticks(ms)
  events.push({ t: 'phase', phase: next, stageNo: world.stageNo, wave: world.wave })
}
function heal(unit: Unit, amount: number, events: SimEvent[]) {
  const actual = Math.min(amount, unit.stats.maxHp - unit.hp)
  if (actual > 0) { unit.hp += actual; events.push({ t: 'heal', uid: unit.uid, sourceUid: unit.uid, amount: actual }) }
}
function resetWave(world: World, events: SimEvent[], fullHeal = false) {
  world.units = world.units.filter((unit) => unit.side === 'ally')
  world.projectiles = []; world.mines = []
  for (const unit of world.units) {
    unit.effects = []; unit.stats = { ...unit.base }; unit.action = { kind: 'none', untilTick: 0 }
    unit.attackReadyTick = world.tick; unit.skillReadyTick = world.tick; unit.ult = 0
    if (fullHeal) {
      if (!unit.alive) events.push({ t: 'revive', uid: unit.uid })
      unit.alive = true; heal(unit, unit.stats.maxHp, events)
    }
  }
  phase(world, 'walking', b.walkMs / (1 + world.moveBonus), events)
}
function beginSpawning(world: World, events: SimEvent[]) {
  const size = waveSizes.find((entry) => world.wave <= entry.through)!.count
  const weight = areaOneWeights.reduce((sum, entry) => sum + entry.weight, 0)
  world.spawnQueue = Array.from({ length: size }, () => {
    let roll = random(world) * weight
    for (const entry of areaOneWeights) { roll -= entry.weight; if (roll < 0) return entry.id }
    return areaOneWeights[areaOneWeights.length - 1].id
  })
  world.spawnIndex = 0; world.nextSpawnTick = world.tick
  phase(world, 'spawning', 0, events)
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
        if (world.loop || world.stageNo < b.maxStage) { if (!world.loop) world.stageNo++; world.wave = 1; resetWave(world, events) }
        else world.phaseUntilTick = Number.MAX_SAFE_INTEGER // M1 has no area 2.
        break
      case 'wipe': world.wave = 1; resetWave(world, events, true); break
    }
  }
  if (world.phase === 'walking' && world.tick < world.phaseUntilTick) {
    for (const unit of world.units.filter(living)) heal(unit, unit.stats.maxHp * b.walkHealPerSecond * b.tickMs / 1000, events)
  }
  if (world.phase === 'spawning' && world.tick >= world.nextSpawnTick) {
    const id = world.spawnQueue[world.spawnIndex]
    const def = enemies[id]
    const waveMul = 1 + b.waveGrowth * (world.wave - 1)
    const stats = { ...def.base, maxHp: def.base.maxHp * b.stageHpGrowth ** (world.stageNo - 1) * waveMul,
      atk: def.base.atk * b.stageAtkGrowth ** (world.stageNo - 1) * waveMul, def: def.base.def * b.stageDefGrowth ** (world.stageNo - 1) }
    const unit = makeUnit(world, 'enemy', id, world.spawnIndex, stats, b.spawnX)
    world.units.push(unit); events.push({ t: 'spawn', uid: unit.uid })
    world.spawnIndex++; world.nextSpawnTick += ticks(b.spawnMs)
    if (world.spawnIndex === world.spawnQueue.length) phase(world, 'battle', 0, events)
  }
}
function strike(world: World, owner: Unit, target: Unit, payload: HitPayload, events: SimEvent[]) {
  // Always consume all three rolls in hit/crit/variance order, even for misses.
  const result = resolveHit(owner.stats, target.stats, payload, [random(world), random(world), random(world)], {
    armored: target.side === 'enemy' && enemies[target.defId].armored,
    obsession: target.effects.some((effect) => effect.kind === 'obsession'),
    invulnerable: target.effects.some((effect) => effect.kind === 'invuln'),
  })
  if (result.missed) { events.push({ t: 'miss', uid: target.uid, sourceUid: owner.uid }); return }
  const amount = Math.min(target.hp, result.amount)
  target.hp -= amount
  events.push({ t: 'damage', uid: target.uid, sourceUid: owner.uid, amount, crit: result.crit, tags: payload.tags })
  owner.ult = Math.min(b.maxGauge, owner.ult + b.ultFromDealt * amount / owner.stats.atk)
  target.ult = Math.min(b.maxGauge, target.ult + b.ultFromTaken * amount / target.stats.maxHp)
  if (owner.defId === 'jirai' && target.hp > 0) {
    target.effects = target.effects.filter((effect) => effect.tag !== 'obsession')
    target.effects.push({ tag: 'obsession', kind: 'obsession', value: b.obsessionMul - 1, untilTick: world.tick + ticks(b.obsessionMs), sourceUid: owner.uid })
    events.push({ t: 'effect', uid: target.uid, tag: 'obsession', on: true })
  }
}
function battleStep(world: World, events: SimEvent[]) {
  const allies = world.units.filter((unit) => unit.side === 'ally' && living(unit))
  const front = allies[0]
  const melee = world.units.filter((unit) => unit.side === 'enemy' && living(unit) && attackDef(unit).kind === 'melee')
  if (front) for (const unit of world.units.filter((unit) => unit.side === 'enemy' && living(unit))) {
    if (unit.action.kind === 'windup') continue
    const stopX = attackDef(unit).kind === 'melee' ? front.x + b.enemyStop + melee.indexOf(unit) * b.enemyGap : front.x + unit.stats.rangeDots
    if (unit.x > stopX) {
      unit.x = Math.max(stopX, unit.x - enemies[unit.defId].speed * b.tickMs / 1000)
      unit.action = { kind: unit.x > stopX ? 'move' : 'none', untilTick: 0 }
    } else unit.action = { kind: 'none', untilTick: 0 }
  }
  const due = world.projectiles.filter((projectile) => projectile.hitTick <= world.tick)
  world.projectiles = world.projectiles.filter((projectile) => projectile.hitTick > world.tick)
  for (const projectile of due) {
    const owner = world.units.find((unit) => unit.uid === projectile.ownerUid)!
    let target = world.units.find((unit) => unit.uid === projectile.targetUid && living(unit))
    if (!target) target = world.units.filter((unit) => unit.side !== owner.side && living(unit))
      .sort((a, z) => Math.abs(a.x - owner.x) - Math.abs(z.x - owner.x))[0]
    if (target) strike(world, owner, target, projectile.payload, events)
  }
  for (const unit of world.units) {
    if (!living(unit) || unit.action.kind !== 'none' || unit.attackReadyTick > world.tick) continue
    const target = chooseTarget(world, unit)
    if (!target) continue
    unit.action = { kind: 'windup', untilTick: world.tick + ticks(b.windupMs), targetUid: target.uid }
    unit.attackReadyTick = world.tick + ticks(unit.stats.intervalMs)
    events.push({ t: 'attack', uid: unit.uid, targetUid: target.uid, kind: attackDef(unit).kind })
  }
  for (const unit of world.units) {
    if (!living(unit) || unit.action.kind !== 'windup' || unit.action.untilTick > world.tick) continue
    const target = world.units.find((candidate) => candidate.uid === unit.action.targetUid && living(candidate))
    unit.action = { kind: 'none', untilTick: 0 }
    if (!target) continue
    const attack = attackDef(unit)
    if (attack.kind === 'melee') { if (Math.abs(unit.x - target.x) <= unit.stats.rangeDots) strike(world, unit, target, { mul: attack.mul }, events) }
    else {
      const shots = unit.defId === 'pachipro' ? b.shotsMin + Math.floor(random(world) * (b.shotsMax - b.shotsMin + 1)) : 1
      for (let index = 0; index < shots; index++) world.projectiles.push({ id: world.nextId++, ownerUid: unit.uid, targetUid: target.uid,
        launchTick: world.tick, hitTick: world.tick + Math.max(1, ticks(Math.abs(target.x - unit.x) / b.projectileDotsPerSecond * 1000)),
        kind: attack.projectile!, payload: { mul: attack.mul } })
    }
  }
  for (const unit of world.units) if (unit.alive && unit.hp <= 0) {
    unit.alive = false; unit.action = { kind: 'none', untilTick: 0 }; events.push({ t: 'death', uid: unit.uid })
    if (unit.side === 'enemy') {
      const def = enemies[unit.defId], rewardMul = b.rewardGrowth ** (world.stageNo - 1)
      events.push({ t: 'reward', koban: Math.floor(def.koban * rewardMul), exp: Math.floor(def.exp * rewardMul), enemyId: unit.defId, x: unit.x })
    }
  }
  if (!world.units.some((unit) => unit.side === 'ally' && living(unit))) {
    world.wipeStreak++; if (world.wipeStreak >= b.wipeLoopThreshold) world.loop = true
    phase(world, 'wipe', b.wipeMs, events)
  } else if (!world.units.some((unit) => unit.side === 'enemy' && living(unit))) {
    for (const unit of world.units.filter((unit) => unit.side === 'ally')) {
      if (!unit.alive) { unit.alive = true; events.push({ t: 'revive', uid: unit.uid }) }
      heal(unit, unit.stats.maxHp * b.clearHeal, events)
    }
    world.projectiles = []; world.mines = []
    phase(world, 'waveClear', b.waveClearMs, events)
  }
}
export function step(world: World, commands: readonly never[] = []): SimEvent[] {
  if (commands.length) throw new Error('Commands are introduced in M5')
  const events: SimEvent[] = []
  for (const unit of world.units) {
    const expired = unit.effects.filter((effect) => effect.untilTick <= world.tick)
    if (expired.length) {
      for (const effect of expired) events.push({ t: 'effect', uid: unit.uid, tag: effect.tag, on: false })
      unit.effects = unit.effects.filter((effect) => effect.untilTick > world.tick)
      unit.stats = withEffects(unit.base, unit.effects)
    }
  }
  phaseStep(world, events)
  if (world.phase === 'battle') battleStep(world, events)
  world.tick++
  return events
}
export function snapshot(world: World, koban = 0): Snapshot {
  return { tick: world.tick, phase: world.phase, stageNo: world.stageNo, wave: world.wave, koban,
    units: world.units.map((unit) => ({ uid: unit.uid, side: unit.side, defId: unit.defId, x: unit.x,
      hpRatio: Math.max(0, Math.min(1, unit.hp / unit.stats.maxHp)), alive: unit.alive,
      action: unit.action.kind, ult: unit.ult, jonen: unit.gauges.jonen, effects: unit.effects.map((effect) => effect.tag) })),
    projectiles: world.projectiles.map((projectile) => ({ id: projectile.id, kind: projectile.kind, fromUid: projectile.ownerUid, toUid: projectile.targetUid, launchTick: projectile.launchTick, hitTick: projectile.hitTick })),
    mines: world.mines.map(({ id, x, explodeTick }) => ({ id, x, explodeTick })) }
}
