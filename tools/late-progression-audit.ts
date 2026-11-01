import { writeFileSync } from 'node:fs'
import { advance, createGame, dojoCost, newProfile, partyOrder, runCommand, validateProfile, type Game, type JobId, type Profile } from '../src/core/index.ts'
import { dojo } from '../src/core/data/progress.ts'
import { availableDojoKeys } from '../src/core/progress/dojoRefund.ts'
import { REAL_TICK_MS } from '../src/core/data/timing.ts'
import { reviewGear } from './reserve-growth.ts'

const tpm = 60000 / REAL_TICK_MS
const round = (n: number) => Math.round(n * 100) / 100
function maintain(game: Game) {
  reviewGear(game, game.profile.offlineJobs)
  const candidate = availableDojoKeys.filter(key => dojo[key].max === null || game.profile.dojo[key] < dojo[key].max!)
    .map(key => ({ key, cost: dojoCost(key, game.profile.dojo[key]) })).filter(entry => entry.cost <= game.profile.koban).sort((a, b) => a.cost - b.cost)[0]
  if (candidate) {
    const result = runCommand(game, { c: 'buyDojo', key: candidate.key })
    if (!result.ok) throw new Error(result.reason)
  }
}
function run(game: Game, minutes: number, capture?: (profile: Profile, minute: number) => void) {
  const clears: Array<{ minute: number; rank: number; floor: number; elapsedSeconds: number }> = []
  const wipes: Array<{ minute: number; rank: number; floor: number; wave: number; loop: boolean }> = []
  const samples: Array<{ minute: number; rank: number; floor: number; best: number[]; levels: number[]; kills: number; wipes: number }> = []
  let entryAt = 0, oldFloor = `${game.world.depthRank}:${game.world.stageNo}`, caughtAt: number | null = null
  for (let tick = 1; tick <= minutes * tpm; tick++) {
    const minute = tick / tpm
    const { events } = advance(game)
    for (const event of events) if (event.t === 'phase') {
      if (event.phase === 'stageClear') clears.push({ minute: round(minute), rank: event.depthRank ?? game.world.depthRank, floor: event.stageNo, elapsedSeconds: round((tick - entryAt) * REAL_TICK_MS / 1000) })
      if (event.phase === 'wipe') wipes.push({ minute: round(minute), rank: game.world.depthRank, floor: event.stageNo, wave: game.world.wave, loop: game.world.loop })
    }
    const key = `${game.world.depthRank}:${game.world.stageNo}`
    if (key !== oldFloor || events.some(event => event.t === 'phase' && event.phase === 'walking' && event.wave === 1)) { entryAt = tick; oldFloor = key }
    capture?.(game.profile, minute)
    if (game.profile.offlineJobs.includes('sister') && caughtAt === null) {
      const levels = game.profile.offlineJobs.map(job => game.profile.party.members[job].lv)
      if (Math.max(...levels) - game.profile.party.members.sister.lv <= 3) caughtAt = round(minute)
    }
    if (tick % tpm === 0) {
      maintain(game)
      if (tick % (5 * tpm) === 0 || minute <= 5) samples.push({ minute, rank: game.world.depthRank, floor: game.world.stageNo, best: [...game.profile.progress.unlockedDepths],
        levels: game.profile.offlineJobs.map(job => game.profile.party.members[job].lv), kills: game.profile.stats.kills, wipes: game.profile.stats.wipes })
    }
  }
  return { minutes, clears, wipes, samples, caughtAt }
}

const results = []
for (const seed of [1, 2, 3]) {
  let at40: Profile | undefined, captureMinute = 0
  const game = createGame(newProfile('late-audit', seed), seed)
  const baseline = run(game, 240, (profile, minute) => {
    if (!at40 && Math.max(...profile.offlineJobs.map(job => profile.party.members[job].lv)) >= 40) {
      at40 = structuredClone(profile); captureMinute = round(minute)
    }
  })
  const branches = []
  if (at40) for (const replacement of [false, true]) {
    const profile = validateProfile(structuredClone(at40)), branch = createGame(profile, seed)
    if (replacement) {
      const party: JobId[] = profile.party.order.slice(0, 3).map(job => job === 'otaku' ? 'sister' : job)
      const result = runCommand(branch, { c: 'reorderParty', order: [...party, ...partyOrder.filter(job => !party.includes(job))] })
      if (!result.ok) throw new Error(result.reason)
    }
    const excluded = partyOrder.filter(job => !['samurai', 'ninja', 'otaku', 'sister'].includes(job))
    const reserveBefore = excluded.map(job => [job, profile.party.members[job].lv, profile.party.members[job].exp])
    const result = run(branch, 60)
    const reserveAfter = excluded.map(job => [job, profile.party.members[job].lv, profile.party.members[job].exp])
    if (JSON.stringify(reserveBefore) !== JSON.stringify(reserveAfter)) throw new Error('Reserve EXP changed')
    branches.push({ replacement, startLevels: (['samurai', 'ninja', 'sister'] as const).map(job => at40!.party.members[job].lv), result })
  }
  results.push({ seed, captureMinute, baseline, branches })
  writeFileSync('.dev-data/late-progression-audit-c4776e9.json', JSON.stringify({ version: 'c4776e9 plus unrelated UI work', policy: 'one gear review and cheapest dojo per minute; at real Lv40 clone both branches and insert Lv1 sister in one', results }, null, 2))
  console.log(JSON.stringify({ seed, captureMinute, end: baseline.samples.at(-1), normal100: baseline.clears.find(clear => clear.rank === 0 && clear.floor === 100), shura1: baseline.clears.find(clear => clear.rank === 1 && clear.floor === 1), branches: branches.map(branch => ({ replacement: branch.replacement, caughtAt: branch.result.caughtAt, end: branch.result.samples.at(-1) })) }))
}
