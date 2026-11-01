import { afterEach, describe, expect, it, vi } from 'vitest'
import { balance } from '../src/core/data/balance'
import { jobs, partyOrder } from '../src/core/data/jobs'
import { activeExperienceMultiplier, newProfile } from '../src/core/progress/profile'
import { formationSupport, previewReplacement } from '../src/core/progress/formationSupport'
import { formationOption, renderFormationSupport } from '../src/renderer/panel/formationSupport'
import { setLocale } from '../src/shared/i18n'

afterEach(() => { setLocale('ja'); vi.unstubAllGlobals() })
describe('formation planning from real skill and experience definitions', () => {
  it('recognizes Otaku healing independently of role and keeps self revival out of ally healing', () => {
    const original = [{ job: 'samurai', lv: 20 }, { job: 'otaku', lv: 20 }, { job: 'jiangshi', lv: 20 }] as const
    const snapshot = structuredClone(original)
    const traits = formationSupport(original).traits
    expect(traits.allyHealing.map(entry => entry.skill)).toEqual([jobs.otaku.skill])
    expect(traits.attackers).toEqual(['samurai', 'jiangshi'])
    expect(traits.selfRevival.map(entry => entry.skill)).toEqual([jobs.jiangshi.passive])
    expect(formationSupport(original.map(member => member.job === 'jiangshi' ? { ...member, lv: balance.passiveLv - 1 } : member)).traits.selfRevival).toEqual([])
    expect(original).toEqual(snapshot)
  })
  it('distinguishes protection for companions from personal protection without inventing healing', () => {
    const traits = formationSupport([{ job: 'bancho', lv: 20 }, { job: 'gariben', lv: 20 }, { job: 'gyaru', lv: 20 }]).traits
    expect(traits.allyHealing).toEqual([])
    expect(traits.attackers).toEqual([])
    expect(traits.partyProtection.map(entry => entry.skill.id)).toEqual(['nanmon'])
    expect(traits.selfProtection.map(entry => entry.skill.id)).toEqual(['tanka'])
    const healers = formationSupport([{ job: 'miko', lv: 20 }, { job: 'sister', lv: 20 }, { job: 'farmer', lv: 20 }]).traits
    expect(healers.allyHealing.map(entry => entry.job)).toEqual(['miko', 'sister'])
    expect(healers.partyProtection.map(entry => entry.job)).toEqual(['miko'])
    const rikishi = formationSupport([{ job: 'rikishi', lv: 20 }, { job: 'sister', lv: 20 }, { job: 'farmer', lv: 20 }]).traits
    expect(rikishi.partyProtection.map(entry => entry.skill.id)).toContain('harite')
    expect(rikishi.selfProtection.map(entry => entry.skill.id)).toContain('harite')
  })
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
      constructor(readonly tag: string) {}
      setAttribute() {}
      addEventListener() {}
      append(...values: Array<Node | string>) { this.children.push(...values) }
      text(): string { return this.children.map(child => typeof child === 'string' ? child : child.text()).join(' ') }
      visibleText(): string { return (this.tag === 'details' ? this.children.slice(0, 1) : this.children).map(child => typeof child === 'string' ? child : child.visibleText()).join(' ') }
    }
    vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) }); setLocale('en')
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
    expect(text).toContain('Formation profile')
    expect(text).toContain('Before:')
    expect(text).toContain('After:')
    expect(text).toContain('No regular ally-healing skill.')
    expect(text).not.toContain('0.65')
    expect(text).not.toContain('0.975')
    expect(text).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
    const revival = (renderFormationSupport([{ job: 'jiangshi', lv: 20 }, { job: 'samurai', lv: 20 }, { job: 'otaku', lv: 20 }]) as unknown as Node).text()
    expect(revival).toContain('Self-revival only, once per battle.')
    expect(revival).toContain('Care Package')
    expect(revival).not.toContain('No regular ally-healing skill.')
    expect(revival).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
    const compact = renderFormationSupport([{ job: 'jiangshi', lv: 20 }, { job: 'samurai', lv: 20 }, { job: 'otaku', lv: 20 }]) as unknown as Node
    expect(compact.visibleText()).toContain('Ally healing: Otaku')
    expect(compact.visibleText()).toContain('Skills and protection details')
    expect(compact.visibleText()).not.toContain('Self-revival only')
    expect(compact.visibleText()).not.toContain('Care Package')
    const swap = renderFormationSupport(next, true, previous) as unknown as Node
    expect(swap.visibleText()).toContain('No regular ally-healing skill.')
    expect(swap.visibleText()).toContain('Before:')
    expect(swap.text()).not.toContain('win-rate')
    setLocale('ja')
    const ja = (renderFormationSupport([{ job: 'samurai', lv: 20 }, { job: 'ninja', lv: 20 }, { job: 'otaku', lv: 20 }], true,
      [{ job: 'jiangshi', lv: 20 }, { job: 'ninja', lv: 20 }, { job: 'otaku', lv: 20 }]) as unknown as Node).text()
    expect(ja).toContain('オタク / 差し入れ')
    expect(ja).toContain('変更前: キョンシー / 貼り直しの霊符')
    expect(ja).toContain('解放済みの自己復活なし')
    expect(ja).not.toContain('仲間を回復する通常技能なし')
  })
})
