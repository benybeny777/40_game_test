import { afterEach, describe, expect, it, vi } from 'vitest'
import { balance } from '../src/core/data/balance'
import { jobs, partyOrder } from '../src/core/data/jobs'
import { activeExperienceMultiplier, newProfile } from '../src/core/progress/profile'
import { formationSupport, previewReplacement } from '../src/core/progress/formationSupport'
import { formationOption, renderFormationSupport } from '../src/renderer/panel/formationSupport'
import { setLocale } from '../src/shared/i18n'

afterEach(() => { setLocale('ja'); vi.unstubAllGlobals() })
describe('formation planning from real skill and experience definitions', () => {
  it('requires both partners and the actual passive unlock level, without claiming generic teams have a combo', () => {
    expect(formationSupport([{ job: 'samurai', lv: 20 }, { job: 'ninja', lv: 20 }, { job: 'otaku', lv: 20 }]).synergies).toEqual([])
    const team = [{ job: 'miko', lv: balance.skillLv }, { job: 'bancho', lv: balance.passiveLv - 1 }, { job: 'ninja', lv: 20 }] as const
    const locked = formationSupport(team).synergies[0]
    expect(locked.id).toBe('ward'); expect(locked.ready).toBe(false)
    expect(locked.requirements[1].skill).toBe(jobs.bancho.passive)
    expect(formationSupport(team.map(member => member.job === 'bancho' ? { ...member, lv: balance.passiveLv } : member)).synergies[0].ready).toBe(true)
    expect(formationSupport([{ job: 'gyaru', lv: balance.skillLv }, { job: 'maid', lv: balance.skillLv }, { job: 'ninja', lv: 20 }]).synergies[0].ready).toBe(true)
    expect(formationSupport([{ job: 'gariben', lv: balance.skillLv }, { job: 'sukeban', lv: balance.passiveLv }, { job: 'ninja', lv: 20 }]).synergies[0].id).toBe('slow')
  })
  it('previews only the exchanged trio and matches the actual reward multiplier for new recruits', () => {
    const profile = newProfile('test')
    profile.party.members.samurai.lv = 20
    const party = profile.party.order.map(job => ({ job, lv: profile.party.members[job].lv }))
    const next = previewReplacement(party, 'ninja', 'miko')
    expect(next.members.map(member => member.job)).toEqual(['samurai', 'miko', 'otaku'])
    expect(next.order).toHaveLength(partyOrder.length)
    const support = formationSupport(next.members)
    for (const member of support.training) expect(member.multiplier).toBe(activeExperienceMultiplier(profile, member.job, next.members.map(entry => entry.job)))
    expect(support.training.find(member => member.job === 'miko')!.multiplier).toBeGreaterThan(1)
    expect(activeExperienceMultiplier(profile, 'miko', profile.offlineJobs)).toBe(1)
    expect(() => previewReplacement(party, 'samurai', 'ninja')).toThrow('deployed and reserve')
    expect(() => formationSupport([next.members[0], next.members[0], next.members[2]])).toThrow('three distinct')
  })
  it('renders role, level requirements, lost synergy and prospective training in English', () => {
    class Node {
      children: Array<Node | string> = []
      setAttribute() {}
      addEventListener() {}
      append(...values: Array<Node | string>) { this.children.push(...values) }
      text(): string { return this.children.map(child => typeof child === 'string' ? child : child.text()).join(' ') }
    }
    vi.stubGlobal('document', { createElement: () => new Node() }); setLocale('en')
    expect(formationOption({ job: 'miko', lv: 1 })).toContain('Healer')
    const previous = [{ job: 'miko', lv: 20 }, { job: 'bancho', lv: 20 }, { job: 'ninja', lv: 20 }] as const
    const next = [{ job: 'gyaru', lv: 20 }, { job: 'maid', lv: 1 }, { job: 'ninja', lv: 20 }] as const
    const text = (renderFormationSupport(next, true, previous) as unknown as Node).text()
    expect(text).toContain('requires Lv1')
    expect(text).toContain('Available synergy before this change')
    expect(text).toContain('up to 3x')
    expect(text).toContain('Offline rewards are excluded.')
    expect(text).toContain('opening knife against a marked enemy is a critical hit')
    expect(text).toContain('actual power and cooldown, including engravings')
    expect(text).not.toContain('0.65')
    expect(text).not.toContain('0.975')
    expect(text).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
  })
})
