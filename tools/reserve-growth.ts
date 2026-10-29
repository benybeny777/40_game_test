import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { advance, buildView, createGame, newProfile, partyOrder, runCommand, validateProfile, type Game, type JobId } from '../src/core/index.ts'
import { ownerOf, scoreDelta } from '../src/core/progress/items.ts'

export function reviewGear(game: Game, jobs: readonly JobId[]) {
  for (const job of jobs) {
    const best = game.profile.inventory.filter((item) => {
      const owner = ownerOf(game.profile, item.id)
      return !owner || owner === job
    }).map((item) => ({ item, delta: scoreDelta(game.profile, job, item) }))
      .filter((candidate) => candidate.delta !== null && candidate.delta > 0)
      .sort((a, z) => z.delta! - a.delta!)[0]
    if (best) {
      const result = runCommand(game, { c: 'equip', job, slot: best.item.slot, itemId: best.item.id })
      if (!result.ok) throw new Error(result.reason)
    }
  }
}

/** Prepare a real B30 save from B1, without fabricating levels or items. */
export function prepareB30(seed: number) {
  const game = createGame(newProfile('simulation', seed), seed)
  for (let tick = 0; tick < 180 * 600; tick++) {
    advance(game)
    if (game.world.stageNo >= 30) return game.profile
    if (tick % 600 === 0) {
      reviewGear(game, game.profile.offlineJobs)
      const dojo = buildView(game.profile, game.world.loop).dojo.filter((d) => d.affordable).sort((a, z) => a.cost - z.cost)[0]
      if (dojo) runCommand(game, { c: 'buyDojo', key: dojo.key })
    }
  }
  throw new Error(`Seed ${seed} did not reach B30 in 180 simulated minutes`)
}

export function reserveGrowth(seed: number) {
  const prepared = prepareB30(seed)
  return (['unchanged', 'sister', 'maid'] as const).flatMap((replacement) => (replacement === 'unchanged' ? [false] : [false, true]).map((equipment) => {
    const profile = validateProfile(JSON.parse(JSON.stringify(prepared)))
    const game = createGame(profile, seed)
    const displaced = replacement === 'maid' ? 'ninja' : 'otaku'
    const party = profile.party.order.slice(0, 3).map((job) => replacement !== 'unchanged' && job === displaced ? replacement : job)
    runCommand(game, { c: 'returnTown' })
    runCommand(game, { c: 'reorderParty', order: [...party, ...partyOrder.filter((job) => !party.includes(job))] })
    runCommand(game, { c: 'setOptions', autoEquip: false })
    if (equipment) reviewGear(game, party)
    runCommand(game, { c: 'selectStage', stageNo: 30 })
    const initialWipes = profile.stats.wipes
    const initialKills = profile.stats.kills
    const initialLevels = Object.fromEntries(party.map((job) => [job, profile.party.members[job].lv]))
    const reserveBefore = JSON.stringify(partyOrder.filter((job) => !party.includes(job)).map((job) => profile.party.members[job]))
    const samples = []
    for (let tick = 1; tick <= 15 * 600; tick++) {
      advance(game)
      if (equipment && tick % 600 === 0) reviewGear(game, party)
      if ([1, 5, 10, 15].includes(tick / 600)) samples.push({ minute: tick / 600, floor: game.world.stageNo, levels: party.map((job) => profile.party.members[job].lv) })
    }
    const reserveAfter = JSON.stringify(partyOrder.filter((job) => !party.includes(job)).map((job) => profile.party.members[job]))
    if (reserveAfter !== reserveBefore) throw new Error('Nonparticipants changed during the trial')
    return { seed, replacement, equipment, initialLevels, samples, wipes: profile.stats.wipes - initialWipes, kills: profile.stats.kills - initialKills }
  }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Actual B1→B30 preparation; 15 simulated minutes after replacement; no off-roster XP, no gear transfer from other characters; equipment case reviews bag once/minute. Not human play.')
  console.table(Array.from({ length: 5 }, (_, i) => reserveGrowth(i + 1)).flat().map((trial) => ({
    seed: trial.seed, replacement: trial.replacement, equipment: trial.equipment, start: Object.values(trial.initialLevels).join('/'),
    levels: trial.samples.map((sample) => sample.levels.join('/')).join(' → '), floors: trial.samples.map((sample) => sample.floor).join(' → '), wipes: trial.wipes, kills: trial.kills,
  })))
}
