import { balance as b } from '../data/balance.ts'
import { enemies } from '../data/enemies.ts'
import { jobs } from '../data/jobs.ts'
import { dojo as dojoDefs, type DojoKey } from '../data/progress.ts'
import { stageLabel } from '../data/stages.ts'
import { computeStats } from '../sim/stats.ts'
import type { JobId } from '../sim/types.ts'
import { dojoCost, expToNext, perMinute, type OfflineResult, type Profile } from './profile.ts'

export interface MemberView {
  job: JobId; name: string; role: string; color: string; lv: number; exp: number; expNext: number
  stats: { hp: number; atk: number; def: number; interval: number; cri: number; eva: number; luk: number; range: string }
  skills: Array<{ kind: '通常' | 'スキル' | 'パッシブ' | '奥義'; name: string; desc: string; unlockLv: number; unlocked: boolean }>
}
export interface ProfileView {
  koban: number; totalKoban: number
  stage: { current: number; unlocked: number; label: string; areaName: string; loop: boolean; max: number }
  party: MemberView[]
  dojo: Array<{ key: DojoKey; name: string; desc: string; level: number; max: number | null; cost: number; affordable: boolean }>
  stages: Array<{ no: number; label: string; areaName: string; unlocked: boolean; current: boolean; boss: boolean }>
  rates: { kobanPerMin: number; expPerMin: number }
  stats: Profile['stats']
  dex: Array<{ id: string; name: string; desc: string; seen: boolean; boss: boolean }>
  pendingOffline: OfflineResult | null
}
const round = (value: number, digits = 0) => Math.round(value * 10 ** digits) / 10 ** digits

export function buildView(profile: Profile, loop: boolean): ProfileView {
  const current = stageLabel(profile.progress.currentStage)
  const rate = perMinute(profile)
  return {
    koban: profile.koban, totalKoban: profile.stats.totalKoban,
    stage: { current: profile.progress.currentStage, unlocked: profile.progress.unlockedStage, label: current.label, areaName: current.areaName, loop, max: b.maxStage },
    party: profile.party.order.map((id) => {
      const job = jobs[id], member = profile.party.members[id], stats = computeStats(job, member.lv, profile.dojo)
      return { job: id, name: job.name, role: job.role, color: job.color, lv: member.lv, exp: member.exp, expNext: expToNext(member.lv),
        stats: { hp: round(stats.maxHp), atk: round(stats.atk, 1), def: round(stats.def, 1), interval: round(stats.intervalMs / 1000, 2),
          cri: round(stats.cri * 100, 1), eva: round(stats.eva * 100, 1), luk: round(stats.luk, 1), range: job.attack.kind === 'melee' ? '近接' : '遠隔' },
        skills: [
          { kind: '通常', name: job.attack.name, desc: `攻撃力×${job.attack.mul}`, unlockLv: 1, unlocked: true },
          { kind: 'スキル', name: job.skill.name, desc: `${job.skill.desc}（${(job.skill.cooldownMs ?? 0) / 1000}秒ごと）`, unlockLv: b.skillLv, unlocked: member.lv >= b.skillLv },
          { kind: 'パッシブ', name: job.passive.name, desc: job.passive.desc, unlockLv: b.passiveLv, unlocked: member.lv >= b.passiveLv },
          { kind: '奥義', name: job.ultimate.name, desc: job.ultimate.desc, unlockLv: b.ultLv, unlocked: member.lv >= b.ultLv },
        ] }
    }),
    dojo: (Object.keys(dojoDefs) as DojoKey[]).map((key) => {
      const def = dojoDefs[key], level = profile.dojo[key], cost = dojoCost(key, level)
      const maxed = def.max !== null && level >= def.max
      return { key, name: def.name, desc: def.desc, level, max: def.max, cost, affordable: !maxed && profile.koban >= cost }
    }),
    stages: Array.from({ length: b.maxStage }, (_, index) => {
      const no = index + 1, label = stageLabel(no)
      return { no, label: label.label, areaName: label.areaName, unlocked: no <= profile.progress.unlockedStage, current: no === profile.progress.currentStage, boss: true }
    }),
    rates: { kobanPerMin: round(rate.koban, 1), expPerMin: round(rate.exp, 1) },
    stats: { ...profile.stats },
    dex: Object.values(enemies).map((enemy) => ({ id: enemy.id, name: enemy.name, desc: enemy.desc, seen: profile.seenEnemies.includes(enemy.id), boss: Boolean(enemy.boss) })),
    pendingOffline: profile.pendingOffline,
  }
}
