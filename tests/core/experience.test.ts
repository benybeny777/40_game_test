import { describe, expect, it } from 'vitest'
import { addOffline, advance, applyRewards, buildView, claimOffline, computeOffline, createGame, deployedJobs, expToNext, newProfile, partyOrder, runCommand, validateProfile, type Game, type JobId, type Profile } from '../../src/core/index.ts'

const formation = (active: JobId[]) => [...active, ...partyOrder.filter(job => !active.includes(job))]
const active = ['samurai', 'ninja', 'otaku'] as JobId[]
const replacement = ['bancho', 'miko', 'maid'] as JobId[]
const earnedExp = (profile: Profile, job: JobId) => profile.party.members[job].exp + Array.from({ length: profile.party.members[job].lv - 1 }, (_, index) => expToNext(index + 1)).reduce((sum, exp) => sum + exp, 0)
const members = (profile: Profile, jobs: readonly JobId[]) => Object.fromEntries(jobs.map(job => [job, { lv: profile.party.members[job].lv, exp: profile.party.members[job].exp, allocated: { ...profile.party.members[job].allocated } }]))
const battle = (game: Game) => { for (let tick = 0; game.world.phase !== 'battle' && tick < 2000; tick++) advance(game); expect(game.world.phase).toBe('battle') }
const killEnemies = (game: Game) => { for (const unit of game.world.units) if (unit.side === 'enemy') unit.hp = 0; return advance(game) }

describe('経験値は実出撃者へだけ付与する', () => {
  it('控えの既存Lv・経験値・配分は、戦闘報酬を受けてもそのまま維持する', () => {
    const profile = newProfile('t')
    profile.party.members.jirai.lv = 7; profile.party.members.jirai.exp = 11; profile.party.members.jirai.allocated.int = 10
    const reserves = partyOrder.filter(job => !active.includes(job)), before = members(profile, reserves)
    const result = applyRewards(profile, [{ t: 'reward', koban: 10, exp: expToNext(1), enemyId: 'chochin', x: 0 }], active)
    expect(result.events.filter(event => event.t === 'levelUp').map(event => event.t === 'levelUp' ? event.job : '')).toEqual(active)
    expect(members(profile, reserves)).toEqual(before)
    expect(active.every(job => profile.party.members[job].lv === 2)).toBe(true)
  })
  it('戦闘中の入替予約者へ先取り経験値を配らず、次ウェーブ参加後から育つ', () => {
    const profile = newProfile('t'), game = createGame(profile, 1)
    battle(game)
    for (const job of active) profile.party.members[job].exp = expToNext(1) - 1
    const before = members(profile, replacement)
    expect(runCommand(game, { c: 'reorderParty', order: formation(replacement) }).ok).toBe(true)
    expect(profile.offlineJobs).toEqual(active)
    const pendingView = buildView(profile, game.world.loop)
    expect(pendingView.formationPending).toBe(true)
    expect(pendingView.party.filter(member => member.active).map(member => member.job)).toEqual(replacement)
    expect(pendingView.party.filter(member => member.fighting).map(member => member.job).sort()).toEqual([...active].sort())
    killEnemies(game)
    expect(active.every(job => profile.party.members[job].lv > 1)).toBe(true)
    expect(members(profile, replacement)).toEqual(before)
    const veterans = members(profile, active)
    game.world.phaseUntilTick = game.world.tick
    advance(game); battle(game)
    expect(profile.offlineJobs).toEqual(replacement)
    const appliedView = buildView(profile, game.world.loop)
    expect(appliedView.formationPending).toBe(false)
    expect(appliedView.party.filter(member => member.fighting).map(member => member.job)).toEqual(replacement)
    killEnemies(game)
    expect(replacement.every(job => earnedExp(profile, job) > 0)).toBe(true)
    expect(members(profile, active)).toEqual(veterans)
  })
  it('宝箱とイベントの経験値も、そのイベント時点の出撃者だけが得る', () => {
    const profile = newProfile('t'); profile.party.order = formation(replacement)
    const before = members(profile, replacement)
    applyRewards(profile, [{ t: 'floorEvent', kind: 'treasure', stageNo: 1, depthRank: 0 },
      { t: 'reward', koban: 20, exp: expToNext(1), enemyId: 'treasure', x: 0, stageNo: 1 }], active)
    expect(active.every(job => profile.party.members[job].lv === 2)).toBe(true)
    expect(members(profile, replacement)).toEqual(before)
  })
})

describe('オフライン経験値の発生時メンバーを固定する', () => {
  it('報酬計算後・受領前の入替で経験値を別キャラへ移せない', () => {
    const profile = newProfile('t'), game = createGame(profile, 1)
    profile.rates.minutes = [{ koban: 10, exp: expToNext(1) * 2 }]
    const reward = computeOffline(profile, 60000)!
    expect(Object.keys(reward.expByJob!)).toEqual(active)
    runCommand(game, { c: 'reorderParty', order: formation(replacement) })
    expect(profile.offlineJobs).toEqual(replacement)
    addOffline(profile, reward)
    reward.expByJob!.samurai = 9999 // The caller cannot mutate already-pending experience.
    const before = members(profile, replacement)
    const result = runCommand(game, { c: 'claimOffline' })
    expect(result.ok).toBe(true)
    expect(active.every(job => profile.party.members[job].lv === 2)).toBe(true)
    expect(members(profile, replacement)).toEqual(before)
    expect(claimOffline(profile)).toEqual([])
  })
  it('異なる編成で貯まった期間はjob別に加算し、重複した参加者だけ両方を得る', () => {
    const profile = newProfile('t'), game = createGame(profile, 1)
    profile.rates.minutes = [{ koban: 10, exp: 20 }]
    addOffline(profile, computeOffline(profile, 60000)!)
    const second = ['samurai', 'miko', 'maid'] as JobId[]
    runCommand(game, { c: 'reorderParty', order: formation(second) })
    addOffline(profile, computeOffline(profile, 60000)!)
    expect(profile.pendingOffline?.expByJob).toEqual({ samurai: 20, ninja: 10, otaku: 10, miko: 10, maid: 10 })
    const restored = validateProfile(JSON.parse(JSON.stringify(profile)))
    const untouched = partyOrder.filter(job => ![...active, ...second].includes(job)), before = members(restored, untouched)
    claimOffline(restored)
    expect(earnedExp(restored, 'samurai')).toBe(20)
    expect(earnedExp(restored, 'ninja')).toBe(10)
    expect(earnedExp(restored, 'miko')).toBe(10)
    expect(members(restored, untouched)).toEqual(before)
  })
  it('スリープ時に入替が予約中でも、実際の出撃者を報酬の対象にする', () => {
    const profile = newProfile('t'), game = createGame(profile, 1)
    battle(game)
    runCommand(game, { c: 'reorderParty', order: formation(replacement) })
    profile.rates.minutes = [{ koban: 10, exp: 40 }]
    const reward = computeOffline(profile, 60000)!
    expect(deployedJobs(profile.party.order)).toEqual(replacement)
    expect(Object.keys(reward.expByJob!)).toEqual(active)
    addOffline(profile, reward)
    const restored = validateProfile(JSON.parse(JSON.stringify(profile))), nextSession = createGame(restored, 1)
    expect(restored.offlineJobs).toEqual(replacement)
    runCommand(nextSession, { c: 'claimOffline' })
    expect(active.every(job => restored.party.members[job].lv === 2)).toBe(true)
    expect(replacement.every(job => restored.party.members[job].lv === 1 && restored.party.members[job].exp === 0)).toBe(true)
  })
  it('旧saved pendingは読込時の先頭3人へ一度固定し、既存の控えLvを下げない', () => {
    const profile = newProfile('t'); profile.party.order = formation(replacement)
    profile.pendingOffline = { ms: 60000, koban: 5, exp: expToNext(1), items: 0 }
    profile.party.members.pachipro.lv = 12; profile.party.members.pachipro.exp = 9
    const raw = JSON.parse(JSON.stringify(profile)); delete raw.offlineJobs
    const restored = validateProfile(raw), game = createGame(restored, 1)
    expect(Object.keys(restored.pendingOffline!.expByJob!)).toEqual(replacement)
    const veteran = members(restored, ['pachipro'])
    runCommand(game, { c: 'reorderParty', order: formation(active) })
    runCommand(game, { c: 'claimOffline' })
    expect(replacement.every(job => restored.party.members[job].lv === 2)).toBe(true)
    expect(active.every(job => restored.party.members[job].lv === 1)).toBe(true)
    expect(members(restored, ['pachipro'])).toEqual(veteran)
  })
  it('旧APIのrecipientなし報酬もadd時に固定し、保存された不正なjobや値は拒否する', () => {
    const profile = newProfile('t'), game = createGame(profile, 1)
    addOffline(profile, { ms: 60000, koban: 0, exp: 10 })
    runCommand(game, { c: 'reorderParty', order: formation(replacement) })
    claimOffline(profile)
    expect(active.every(job => earnedExp(profile, job) === 10)).toBe(true)
    expect(replacement.every(job => profile.party.members[job].exp === 0)).toBe(true)
    for (const invalid of [{ nonexistent: 20 }, { samurai: -1 }, { samurai: Infinity }]) {
      const raw = { ...newProfile('t'), pendingOffline: { ms: 60000, koban: 0, exp: 20, expByJob: invalid } }
      expect(() => validateProfile(raw)).toThrow('bad offline experience')
    }
  })
})
