import { describe, expect, it } from 'vitest'
import { jobs, partyOrder } from '../../src/core/data/jobs.ts'
import { engravingCandidates, effectiveSkill, skillEngravings, type SkillEngraving } from '../../src/core/data/skillEngravings.ts'
import { skillDescription } from '../../src/core/data/skillDescription.ts'
import { newProfile, validateProfile } from '../../src/core/progress/profile.ts'
import { compareEquipment, power, equipItem, receiveItem, rollItem, statsOf, type Item } from '../../src/core/progress/items.ts'
import { createWorld, refreshParty, snapshot, step } from '../../src/core/sim/world.ts'
import { skills, ultimates } from '../../src/core/sim/skills.ts'
import { ticks } from '../../src/core/sim/time.ts'
import type { JobId, SimEvent, Unit } from '../../src/core/sim/types.ts'
import { buildView } from '../../src/core/progress/view.ts'
import { nextLootChoice } from '../../src/renderer/panel/nextChoice.ts'
import { compareEquipmentChoices } from '../../src/renderer/panel/equipmentComparison.ts'
import { translateGameText } from '../../src/shared/locales/en-game.ts'

const weapon = (job: JobId, engraving?: SkillEngraving): Item => ({ id: 'engraved', slot: 'weapon', job, engraving,
  ilvl: 1, rarity: 3, name: 'Test', locked: false, isNew: true, atk: 1, hp: 0, def: 0, affixes: [] })
function fight(job: JobId, engraving?: SkillEngraving) {
  const world = createWorld({ level: 15, seed: 7, gear: { [job]: [weapon(job, engraving)] } })
  const self = [...world.units, ...world.reserves].find(unit => unit.defId === job)!
  self.x = 0; self.stats.cri = 0; self.stats.luk = 1000
  const foe: Unit = { ...self, uid: 100, side: 'enemy', defId: 'ooni', x: 12, hp: 100000,
    stats: { ...self.stats, maxHp: 100000, def: 0, eva: 0 }, effects: [], gauges: {} }
  world.units = [self, foe]; world.reserves = []; world.phase = 'battle'
  const events: SimEvent[] = []
  return { world, self, foe, events }
}

describe('weapon skill engravings', () => {
  it('does not assign a total score to adding, removing or changing engravings', () => {
    const profile = newProfile('tradeoff'), item = weapon('samurai', 'focus')
    const plain = { ...weapon('samurai'), id: 'plain', atk: 999 }
    profile.inventory.push(item, plain)
    expect(compareEquipment(profile, 'samurai', item)?.delta).toBeNull()
    let view = buildView(profile, false)
    const engravedView = view.inventory.find(entry => entry.id === item.id)!
    expect(engravedView.delta.samurai).toBeUndefined()
    expect(engravedView.skillTradeoff.samurai?.after).toContain('1.5倍')
    expect(nextLootChoice(view)?.item.id).toBe('plain')
    expect(compareEquipmentChoices(engravedView, view.inventory.find(entry => entry.id === 'plain')!, 'samurai')).toBeGreaterThan(0)
    equipItem(profile, 'samurai', 'weapon', item.id)
    expect(compareEquipment(profile, 'samurai', plain)?.delta).toBeNull()
    view = buildView(profile, false)
    const removing = view.inventory.find(entry => entry.id === 'plain')!
    expect(removing.delta.samurai).toBeUndefined()
    expect(removing.skillTradeoff.samurai).toEqual({ before: skillEngravings.focus.description, after: undefined })
    expect(nextLootChoice(view)?.item.id).toBe('plain')
  })
  it('prioritizes armor improvements, compares same engravings normally, and ignores weak engraving removal', () => {
    const profile = newProfile('choices')
    const oldPosition = profile.party.order.indexOf('jiangshi')
    ;[profile.party.order[0], profile.party.order[oldPosition]] = [profile.party.order[oldPosition], profile.party.order[0]]
    const worn = { ...weapon('jiangshi', 'focus'), atk: 20 }
    const weak = { ...weapon('jiangshi'), id: 'weak', atk: 1 }
    const same = { ...weapon('jiangshi', 'focus'), id: 'same', atk: 25 }
    const other = { ...weapon('jiangshi', 'duration'), id: 'other', atk: 20 }
    const armor: Item = { ...weapon('jiangshi'), id: 'armor', job: undefined, slot: 'armor', rarity: 0, atk: 0, hp: 10000, requirements: { str: 0, dex: 0, vit: 0, int: 0 } }
    profile.inventory.push(worn, weak, same, other, armor)
    equipItem(profile, 'jiangshi', 'weapon', worn.id)
    expect(compareEquipment(profile, 'jiangshi', same)?.skillTradeoff).toBeUndefined()
    expect(compareEquipment(profile, 'jiangshi', same)?.delta).toBeGreaterThan(0)
    expect(compareEquipment(profile, 'jiangshi', other)?.delta).toBeNull()
    expect(nextLootChoice(buildView(profile, false))?.item.id).toBe('armor')
    armor.isNew = false
    expect(nextLootChoice(buildView(profile, false))?.item.id).toBe('same')
    same.isNew = false
    expect(nextLootChoice(buildView(profile, false))?.item.id).toBe('other')
    other.isNew = false
    expect(nextLootChoice(buildView(profile, false))).toBeUndefined()
    const view = buildView(profile, false)
    expect([...view.inventory].sort((a, b) => compareEquipmentChoices(a, b, 'jiangshi')).map(item => item.id)).toEqual(['armor', 'same', 'other', 'weak'])
  })
  it('ranks ordinary improvements by score before rarity', () => {
    const profile = newProfile('ordinary')
    profile.inventory.push({ ...weapon('samurai'), id: 'rare-small', atk: 2, rarity: 4 },
      { ...weapon('samurai'), id: 'plain-large', atk: 100, rarity: 0 })
    expect(nextLootChoice(buildView(profile, false))?.item.id).toBe('plain-large')
  })
  it('normal scoring remains positive and increasing ATK never reverses with long cooldowns', () => {
    const profile = newProfile('score')
    for (const job of partyOrder) for (const cooldownMul of [0.35, 1, 1.3, 3, 100]) {
      const stats = { ...statsOf(profile, job), cooldownMul }
      expect(power(job, stats), job).toBeGreaterThan(0)
      expect(power(job, { ...stats, atk: stats.atk + 100 }), job).toBeGreaterThan(power(job, stats))
      expect(power(job, { ...stats, cooldownMul: cooldownMul * 0.9 }), job).toBeGreaterThan(power(job, stats))
    }
  })
  it('rolls about 20% on epic/legendary weapons, never on other slots or mythics', () => {
    const state = { rng: 912 }; let engraved = 0
    for (let i = 0; i < 10000; i++) {
      const item = rollItem(state, 'test', { ilvl: 50, jobs: partyOrder, luk: 0, slot: 'weapon', minRarity: 3, maxRarity: 4 })
      if (item.engraving) { engraved++; expect(engravingCandidates(item.job!)).toContain(item.engraving) }
    }
    expect(engraved / 10000).toBeGreaterThan(0.18); expect(engraved / 10000).toBeLessThan(0.22)
    for (const rarity of [0, 1, 2, 5] as const) for (let i = 0; i < 50; i++) {
      expect(rollItem(state, 'x', { ilvl: 1, jobs: partyOrder, luk: 0, slot: 'weapon', minRarity: rarity, maxRarity: rarity }).engraving).toBeUndefined()
    }
    for (const slot of ['armor', 'charm'] as const) expect(rollItem(state, 'x', { ilvl: 1, jobs: partyOrder, luk: 0, slot, minRarity: 3, maxRarity: 4 }).engraving).toBeUndefined()
  })
  it('preserves old saves and rejects incompatible or malformed present engraving fields', () => {
    const profile = newProfile('engraving'); profile.inventory.push(weapon('samurai'))
    expect(validateProfile(profile).inventory[0].engraving).toBeUndefined()
    for (const invalid of [null, 42, 'bogus', 'duration']) {
      expect(() => validateProfile({ ...profile, inventory: [{ ...profile.inventory[0], engraving: invalid }] })).toThrow('bad skill engraving')
    }
    for (const patch of [{ slot: 'armor' }, { rarity: 2 }, { rarity: 5 }, { equipmentClass: 'unique' }]) {
      expect(() => validateProfile({ ...profile, inventory: [{ ...weapon('samurai', 'focus'), ...patch }] })).toThrow('bad skill engraving')
    }
    profile.inventory[0].engraving = 'focus'
    expect(validateProfile(profile).inventory[0].engraving).toBe('focus')
  })
  it('never automatically equips or replaces an engraving; manual removal restores base parameters', () => {
    const profile = newProfile('engraving'), item = weapon('samurai', 'focus')
    expect(receiveItem(profile, item).equippedBy).toBeUndefined()
    expect(equipItem(profile, 'samurai', 'weapon', item.id).ok).toBe(true)
    expect(statsOf(profile, 'samurai').skillPowerMul).toBe(1.5)
    expect(statsOf(profile, 'samurai').cooldownMul).toBe(1.3)
    expect(receiveItem(profile, { ...weapon('samurai'), id: 'strong', atk: 1000 }).equippedBy).toBeUndefined()
    expect(equipItem(profile, 'samurai', 'weapon', null).ok).toBe(true)
    expect(statsOf(profile, 'samurai').skillPowerMul).toBe(1)
    expect(statsOf(profile, 'samurai').cooldownMul).toBe(1)
  })
  it('every duration candidate changes real effect expiry, without changing magnitude', () => {
    for (const job of partyOrder.filter(job => engravingCandidates(job).includes('duration'))) {
      const normal = fight(job), marked = fight(job, 'duration')
      skills[jobs[job].skill.id].use(normal); skills[jobs[job].skill.id].use(marked)
      const baseEffects = normal.world.units.flatMap(unit => unit.effects)
      const enhanced = marked.world.units.flatMap(unit => unit.effects)
      expect(baseEffects.length, job).toBeGreaterThan(0)
      expect(enhanced.map(effect => effect.value), job).toEqual(baseEffects.map(effect => effect.value))
      expect(enhanced.map(effect => effect.untilTick), job).toEqual(baseEffects.map(effect => Math.ceil(effect.untilTick * 1.5)))
    }
  })
  it('all focus jobs consume stronger params in damage, healing or delayed payload', () => {
    for (const job of partyOrder.filter(job => engravingCandidates(job).includes('focus'))) {
      const normal = fight(job), marked = fight(job, 'focus')
      if (job === 'otaku' || job === 'sister') {
        normal.self.hp = 1; marked.self.hp = 1
        normal.self.stats.maxHp = 10000; marked.self.stats.maxHp = 10000
      }
      skills[jobs[job].skill.id].use(normal); skills[jobs[job].skill.id].use(marked)
      if (job === 'samurai') expect(marked.self.effects[0].value).toBe(normal.self.effects[0].value * 1.5)
      else if (job === 'jirai') expect(marked.world.mines[0].payload.mul).toBe(normal.world.mines[0].payload.mul * 1.5)
      else if (job === 'otaku' || job === 'sister') {
        expect(marked.self.hp - normal.self.hp).toBeCloseTo(normal.self.stats.atk * jobs[job].skill.params.mul * 0.5, 0)
      } else expect(marked.foe.hp, job).toBeLessThan(normal.foe.hp)
    }
  })
  it('leaves ultimates unchanged and keeps the effective cooldown gauge honest', () => {
    const normal = fight('maid'), marked = fight('maid', 'focus')
    ultimates.knifecurtain(normal); ultimates.knifecurtain(marked)
    expect(marked.foe.hp).toBe(normal.foe.hp)
    const ninja = fight('ninja', 'duration')
    ninja.self.attackReadyTick = Number.MAX_SAFE_INTEGER; ninja.foe.attackReadyTick = Number.MAX_SAFE_INTEGER; ninja.foe.skillReadyTick = Number.MAX_SAFE_INTEGER
    step(ninja.world)
    expect(ninja.self.skillReadyTick).toBe(ticks(jobs.ninja.skill.cooldownMs! * 1.3))
    const snap = snapshot(ninja.world).units[0]
    expect(snap.skillRemainingMs).toBe((ninja.self.skillReadyTick - ninja.world.tick) * 100)
    expect(snap.skillReady).toBeCloseTo(1 / ticks(jobs.ninja.skill.cooldownMs! * 1.3))
    refreshParty(ninja.world, {}, {}, {})
    expect(ninja.self.stats.skillDurationMul).toBe(1)
  })
  it('describes effective normal skills in Japanese and English with no base-value lies', () => {
    for (const job of partyOrder) {
      expect(engravingCandidates(job).length).toBeGreaterThan(0)
      for (const engraving of engravingCandidates(job)) {
        const { self } = fight(job, engraving)
        const description = skillDescription(effectiveSkill(jobs[job].skill, self.stats))
        expect(description).not.toMatch(/\{\w+\}/)
        expect(translateGameText(description)).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
        expect(translateGameText(skillEngravings[engraving].description)).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
      }
    }
  })
})
