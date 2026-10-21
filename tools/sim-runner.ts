import { parseArgs } from 'node:util'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { advance, balance, buildView, createGame, createWorld, newProfile, runCommand, snapshot, stageLabel, step, type DojoKey } from '../src/core/index.ts'
import { partyOrder } from '../src/core/data/jobs.ts'

export function simulate(options: { stage: number; minutes: number; seed: number; level: number }) {
  const world = createWorld({ seed: options.seed, stageNo: options.stage, level: options.level, loop: true })
  const totalTicks = Math.floor(options.minutes * 60 * 1000 / balance.tickMs)
  const samples = []
  let koban = 0, exp = 0, wipes = 0, clears = 0, stageClears = 0
  let waveStart = 0, stageStart = 0, waveMs = 0, stageMs = 0
  const damage: Record<string, number> = Object.fromEntries(partyOrder.map((id) => [id, 0]))
  const healing: Record<string, number> = { ...damage }
  const report = () => ({ minutes: world.tick * balance.tickMs / 60000, stage: world.stageNo, wave: world.wave,
    waveClears: clears, stageClears, wipes, wipeRate: wipes / Math.max(1, wipes + clears),
    meanWaveSeconds: clears ? waveMs / clears / 1000 : null, meanStageSeconds: stageClears ? stageMs / stageClears / 1000 : null,
    koban, exp, kobanPerMinute: koban / Math.max(world.tick * balance.tickMs / 60000, Number.EPSILON),
    expPerMinute: exp / Math.max(world.tick * balance.tickMs / 60000, Number.EPSILON),
    damage: { ...damage }, healing: { ...healing }, drops: null })
  const started = performance.now()
  for (let tick = 0; tick < totalTicks; tick++) {
    const events = step(world)
    for (const event of events) {
      if (event.t === 'reward') { koban += event.koban; exp += event.exp }
      if (event.t === 'damage' || event.t === 'heal') {
        const source = world.units.find((unit) => unit.uid === event.sourceUid)
        if (source?.side === 'ally') {
          const totals = event.t === 'damage' ? damage : healing
          totals[source.defId] = (totals[source.defId] ?? 0) + event.amount
        }
      }
      if (event.t === 'phase') {
        if (event.phase === 'walking') { waveStart = tick; if (event.wave === 1) stageStart = tick }
        if (event.phase === 'wipe') wipes++
        if (event.phase === 'waveClear') { clears++; waveMs += (tick - waveStart) * balance.tickMs }
        if (event.phase === 'stageClear') { stageClears++; stageMs += (tick - stageStart) * balance.tickMs; stageStart = tick }
      }
    }
    if (world.tick % (60000 / balance.tickMs) === 0) samples.push(report())
  }
  const summary = report()
  const ratio = (totals: Record<string, number>) => {
    const total = Object.values(totals).reduce((sum, value) => sum + value, 0)
    return Object.fromEntries(Object.entries(totals).map(([id, value]) => [id, total ? value / total : 0]))
  }
  return { mode: 'M1 fixed-level / normal-attacks-only / no-boss', seed: options.seed, level: options.level, samples,
    summary: { ...summary, damageShare: ratio(damage), healingShare: ratio(healing) },
    snapshotHash: createHash('sha256').update(JSON.stringify(snapshot(world, koban))).digest('hex'), elapsedMs: performance.now() - started }
}

/** --progress: play from a new save with the real progression rules, buying the cheapest dojo upgrade whenever affordable. */
export function simulateProgress(options: { minutes: number; seed: number }) {
  const game = createGame(newProfile('sim'), options.seed)
  const totalTicks = Math.floor(options.minutes * 60000 / balance.tickMs)
  const firstClear: Record<string, number> = {}
  const samples = []
  let ultimates = 0, skills = 0, kakuhenHits = 0, kakuhenTries = 0
  const started = performance.now()
  for (let tick = 1; tick <= totalTicks; tick++) {
    const { events } = advance(game)
    for (const event of events) {
      if (event.t === 'phase' && event.phase === 'stageClear' && firstClear[event.stageNo] === undefined) firstClear[event.stageNo] = tick * balance.tickMs / 60000
      if (event.t === 'ultimate') ultimates++
      if (event.t === 'skill') skills++
      if (event.t === 'kakuhen') { kakuhenTries++; if (event.hit) kakuhenHits++ }
    }
    if (tick % 100 === 0) {
      const view = buildView(game.profile, game.world.loop)
      const cheapest = view.dojo.filter((entry) => entry.affordable).sort((a, z) => a.cost - z.cost)[0]
      if (cheapest) runCommand(game, { c: 'buyDojo', key: cheapest.key as DojoKey })
    }
    if (tick % (600000 / balance.tickMs) === 0) {
      const p = game.profile
      samples.push({ 分: tick * balance.tickMs / 60000, ステージ: stageLabel(game.world.stageNo).label, 解放: p.progress.unlockedStage,
        Lv: Object.values(p.party.members).map((member) => member.lv).join('/'), 小判: Math.floor(p.koban), 道場: Object.values(p.dojo).join('/'),
        全滅: p.stats.wipes, 撃破: p.stats.kills, 周回: game.world.loop ? 'ON' : '' })
    }
  }
  return { seed: options.seed, minutes: options.minutes, samples, firstClear, stats: game.profile.stats, ultimates, skills,
    kakuhenRate: kakuhenTries ? kakuhenHits / kakuhenTries : null, elapsedMs: performance.now() - started }
}
function printProgress(result: ReturnType<typeof simulateProgress>, json: boolean) {
  if (json) { console.log(JSON.stringify(result, null, 2)); return }
  console.log(`新規セーブからの進行（seed ${result.seed}、${result.minutes}分、道場は買える最安を自動購入）`)
  console.table(result.samples)
  console.log('初クリア（分）:', Object.entries(result.firstClear).map(([stage, minutes]) => `${stageLabel(Number(stage)).label}=${minutes.toFixed(1)}`).join('  '))
  console.log(`奥義 ${result.ultimates}回 / スキル ${result.skills}回 / 確変の当たり率 ${result.kakuhenRate === null ? '-' : (result.kakuhenRate * 100).toFixed(1) + '%'}`)
  console.log(`実行時間: ${result.elapsedMs.toFixed(0)}ms`)
}

function main() {
  const { values } = parseArgs({ args: process.argv.slice(2).filter((arg) => arg !== '--'), options: {
    stage: { type: 'string', default: '1' }, minutes: { type: 'string', default: '10' },
    seed: { type: 'string', default: '1' }, lv: { type: 'string', default: '1' }, json: { type: 'boolean' }, progress: { type: 'boolean' },
  } })
  if (values.progress) { printProgress(simulateProgress({ minutes: Number(values.minutes), seed: Number(values.seed) }), values.json === true); return }
  const minutes = Number(values.minutes)
  if (!Number.isFinite(minutes) || minutes <= 0 || !Number.isSafeInteger(minutes * 60000 / balance.tickMs)) throw new RangeError('--minutes は正の100ms刻みの時間を指定してください')
  const result = simulate({ stage: Number(values.stage), minutes, seed: Number(values.seed), level: Number(values.lv) })
  if (values.json) { console.log(JSON.stringify(result, null, 2)); return }
  console.log('M1 通常攻撃のみ・固定Lv・エリア1周回（ボス／育成／ドロップ未実装）')
  console.table(result.samples.map((sample) => ({ 分: sample.minutes, ステージ: sample.stage, ウェーブ: sample.wave,
    クリア: sample.waveClears, 全滅: sample.wipes, 小判毎分: sample.kobanPerMinute.toFixed(1), 経験値毎分: sample.expPerMinute.toFixed(1) })))
  console.log('合計:', JSON.stringify(result.summary, null, 2))
  console.log('回復割合はウェーブ間の自動回復を含みます。ドロップ内訳は未実装です。')
  console.log(`Snapshot SHA-256: ${result.snapshotHash}\n実行時間: ${result.elapsedMs.toFixed(1)}ms`)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 }
}
