import { afterEach, describe, expect, it } from 'vitest'
import { attributeLabels, buildView, createGame, difficulties, dungeons, jobs, newProfile, partyOrder, roleLabels, runCommand, validateProfile } from '../src/core/index.ts'
import { affixes, armorNames, charmNames, rarities, slots, uniqueDefs, weaponNames } from '../src/core/data/items.ts'
import { enemies } from '../src/core/data/enemies.ts'
import { dojo } from '../src/core/data/progress.ts'
import { enemyGuide } from '../src/shared/enemyGuide.ts'
import { describe as itemDescription, itemName, rollItem } from '../src/core/progress/items.ts'
import { gameEnglish, gameTranslations, translateGameText } from '../src/shared/locales/en-game.ts'
import { setLocale, translatedLabel } from '../src/shared/i18n.ts'

const japanese = /[ぁ-んァ-ヶ一-龥]/u
const translated = (source: string) => { const result = translateGameText(source); expect(result, source).not.toMatch(japanese); expect(result.length).toBeGreaterThan(0); return result }
afterEach(() => setLocale('ja'))

describe('English game-data boundary', () => {
  it.each(partyOrder)('%s has stable keys for its name, role, weapon and every skill description', (id) => {
    const job = jobs[id]
    const fields = { name: job.name, roleDetail: job.roleDetail, weapon: job.weapon, 'attack.name': job.attack.name,
      'skill.name': job.skill.name, 'skill.desc': job.skill.desc, 'passive.name': job.passive.name, 'passive.desc': job.passive.desc, 'ultimate.name': job.ultimate.name, 'ultimate.desc': job.ultimate.desc }
    for (const [field, source] of Object.entries(fields)) {
      expect(gameTranslations[`job.${id}.${field}`]?.ja).toBe(source)
      translated(source)
    }
    translated(roleLabels[job.role])
  })
  it('covers enemies, boss moves, codex tactics, training, attributes and dungeon themes', () => {
    for (const [id, enemy] of Object.entries(enemies)) {
      for (const source of [enemy.name, enemy.desc, enemyGuide(id).role, enemyGuide(id).tactic]) translated(source)
      if (enemy.boss) translated(enemy.boss.skill.name)
    }
    for (const entry of Object.values(dojo)) { translated(entry.name); translated(entry.desc) }
    for (const source of Object.values(attributeLabels)) translated(source)
    for (const dungeon of Object.values(dungeons)) { translated(dungeon.name); dungeon.biomes.forEach(translated) }
    for (const difficulty of difficulties) translated(difficulty.name)
  })
  it('covers every equipment family, affix, rarity and unique build description', () => {
    for (const source of [...Object.values(weaponNames).flat(), ...armorNames, ...charmNames, ...rarities.map(entry => entry.name), ...Object.values(slots).map(entry => entry.name), ...Object.values(affixes).map(entry => entry.name)]) translated(source)
    for (const def of Object.values(uniqueDefs)) { translated(def.name); translated(def.build) }
    for (const job of partyOrder) for (const rank of [1, 6, 15, 30, 60]) translated(itemName('weapon', job, rank))
  })
  it.each(partyOrder)('%s translates actual high-rank weapon names without changing saved names', job => {
    const roman: Record<string, string> = { 弐: 'II', 参: 'III', 肆: 'IV', 伍: 'V', 陸: 'VI', 漆: 'VII', 捌: 'VIII', 玖: 'IX' }
    for (const rank of [1, 20, 40, 60]) {
      const source = itemName('weapon', job, rank), english = translated(source)
      const suffix = /・改([弐参肆伍陸漆捌玖])$/.exec(source)
      if (suffix) expect(english.endsWith(` Mk ${roman[suffix[1]]}`)).toBe(true)
      expect(itemName('weapon', job, rank)).toBe(source)
    }
    for (const [index, tier] of Object.keys(roman).entries()) {
      const source = itemName('weapon', job, 16 + index * 5)
      expect(source.endsWith(`・改${tier}`)).toBe(true)
      expect(translated(source).endsWith(` Mk ${roman[tier]}`)).toBe(true)
    }
  })
  it('translates generated stat rolls, requirements and multi-requirement failures as complete structured phrases', () => {
    expect(translateGameText('必要能力：筋力100 / 体力20')).toBe('Requirements: STR 100 / VIT 20')
    expect(translateGameText('敏捷100必要（現在14）、体力20必要（現在7）')).toBe('Requires Dexterity 100 (current 14), Requires Vitality 20 (current 7)')
    expect(translateGameText('基礎性能109%（85〜115%）')).toBe('Base roll 109% (85-115%)')
    const state = { rng: 37 }
    for (let index = 0; index < 300; index++) {
      const item = rollItem(state, `i${index}`, { ilvl: index % 60 + 1, luk: 100, jobs: partyOrder })
      translated(item.name)
      itemDescription(item).forEach(translated)
    }
  })
  it('translates the complete computed view without mutating core data or saved IDs', () => {
    const profile = newProfile('test')
    for (const member of Object.values(profile.party.members)) member.lv = 60
    const restored = validateProfile(JSON.parse(JSON.stringify(profile)))
    const before = JSON.stringify(restored), view = buildView(restored, false)
    for (const member of view.party) {
      translated(member.name); translated(member.role); translated(member.stats.range)
      for (const skill of member.skills) { translated(skill.kind); translated(skill.name); translated(skill.desc) }
    }
    translated(view.dungeon.name); translated(view.dungeon.difficultyLabel); translated(view.dungeon.theme)
    expect(JSON.stringify(restored)).toBe(before)
    for (const source of ['samurai', 'gariben', 'yomi', 'i17', 'dropPct', 'B100']) expect(translateGameText(source)).toBe(source)
  })
  it('covers gameplay errors and dynamic combat banners', () => {
    const game = createGame(newProfile('test'), 1)
    for (const command of [
      { c: 'selectStage' as const, stageNo: 99 }, { c: 'claimOffline' as const }, { c: 'equip' as const, job: 'samurai' as const, slot: 'weapon' as const, itemId: 'missing' },
      { c: 'sellAll' as const, maxRarity: 5 as const }, { c: 'allocateStats' as const, job: 'samurai' as const, key: 'str' as const, points: 99 },
    ]) { const result = runCommand(game, command); expect(result.ok).toBe(false); if (!result.ok) translated(result.reason) }
    for (const source of ['ボス出現！', 'B10 踏破！', '地下 42 階', '全滅… ウェーブ1から', '宝箱を発見！', '祭壇の祝福', '神話の装備！ 巨神の断ち刃', '発見 3 / 12種。姿と特徴を知り、次の編成に生かそう。']) translated(source)
  })
  it('keeps unknown text intact and never replaces words inside unregistered phrases', () => {
    for (const source of ['筋力を上げたい', '未知の名刀・無銘の物語', '回避する敵です', '<script>', '', 'my-custom-item']) expect(translateGameText(source)).toBe(source)
    expect(translateGameText('攻撃 +15.2')).toBe('ATK +15.2')
    expect(translateGameText('被ダメージ -20%')).toBe('Damage Taken -20%')
  })
  it('shares the same source translation consistently and leaves Japanese presentation unchanged', () => {
    const seen = new Map<string, string>()
    for (const { ja, en } of Object.values(gameTranslations)) {
      if (seen.has(ja)) expect(en, ja).toBe(seen.get(ja))
      seen.set(ja, en)
      expect(gameEnglish[ja]).toBe(en)
    }
    setLocale('ja'); expect(translatedLabel(jobs.miko.name)).toBe(jobs.miko.name)
    setLocale('en'); expect(translatedLabel(jobs.miko.name)).toBe('Shrine Maiden')
  })
})
