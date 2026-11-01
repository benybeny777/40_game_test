import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildView, newProfile } from '../src/core/index'
import { equipItem, type Item } from '../src/core/progress/items'
import { renderEquipmentComparison } from '../src/renderer/panel/equipmentComparison'
import { equipmentTrainingTarget, equipmentTrainingEnd, renderEquipmentTraining, focusEquipmentTraining } from '../src/renderer/panel/equipmentTraining'
import { setLocale } from '../src/shared/i18n'

class Node {
  children: Array<Node | string> = []; listeners = new Map<string, () => void>()
  setAttribute() {}
  append(...children: Array<Node | string>) { this.children.push(...children) }
  addEventListener(name: string, callback: () => void) { this.listeners.set(name, callback) }
  text(): string { return this.children.map(child => typeof child === 'string' ? child : child.text()).join(' ') }
  button(): Node | undefined { return this.listeners.has('click') ? this : this.children.filter(child => child instanceof Node).map(child => child.button()).find(Boolean) }
}
afterEach(() => { vi.unstubAllGlobals(); setLocale('ja') })
const armor: Item = { id: 'training-armor', name: '鉄板胴丸', slot: 'armor', equipmentClass: 'heavy', ilvl: 10, rarity: 2,
  locked: true, isNew: true, atk: 0, hp: 80, def: 8, affixes: [], requirements: { str: 20, dex: 0, vit: 20, int: 0 } }
describe('equipment requirement to training navigation', () => {
  it.each(['ja', 'en'] as const)('keeps the selected reserve and exact item, updates missing stats, and never mutates allocation (%s)', locale => {
    vi.stubGlobal('document', { createElement: () => new Node() }); setLocale(locale)
    const profile = newProfile('test'); profile.inventory.push(structuredClone(armor))
    let view = buildView(profile, false)
    const item = view.inventory[0], before = JSON.stringify(profile), train = vi.fn()
    const check = item.equipable.bancho
    expect(check).toMatchObject({ ok: false, missing: [{ key: 'str', current: 13, required: 20 }, { key: 'vit', current: 12, required: 20 }] })
    const comparison = renderEquipmentComparison(item, 'bancho', train) as unknown as Node
    comparison.button()!.listeners.get('click')!()
    expect(train).toHaveBeenCalledWith(item, 'bancho')
    expect(renderEquipmentComparison(item, 'miko', train)).toBeNull() // Class mismatch cannot be solved by attributes.
    const target = equipmentTrainingTarget(item, 'bancho'), back = vi.fn(), remove = vi.fn()
    const goal = renderEquipmentTraining(view, target, back, remove) as unknown as Node
    expect(goal.text()).toContain('13 / 20'); expect(goal.text()).toContain('12 / 20')
    goal.button()!.listeners.get('click')!(); expect(back).toHaveBeenCalledOnce()
    const removeButton = goal.children.find(child => child instanceof Node && child.text() === (locale === 'ja' ? '目標を外す' : 'Remove goal')) as Node
    removeButton.listeners.get('click')!(); expect(remove).toHaveBeenCalledOnce()
    expect(JSON.stringify(profile)).toBe(before)
    if (locale === 'en') expect(goal.text()).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
    profile.party.members.bancho.allocated.str = 7; profile.party.members.bancho.allocated.vit = 8
    view = buildView(profile, false)
    expect((renderEquipmentTraining(view, target, back, remove) as unknown as Node).text()).toContain(locale === 'ja' ? '装備条件を満たしました' : 'Requirements met')
    profile.inventory = []
    expect((renderEquipmentTraining(buildView(profile, false), target, back, remove) as unknown as Node).text()).toContain(locale === 'ja' ? '持ち物にありません' : 'no longer in your inventory')
  })
  it.each(['ja', 'en'] as const)('ends goals explicitly on equip, disappearance or another deployed owner, while allowing reserve transfer (%s)', locale => {
    setLocale(locale)
    const profile = newProfile('test'); profile.inventory.push(structuredClone(armor))
    profile.party.members.bancho.allocated.str = 7; profile.party.members.bancho.allocated.vit = 8
    const target = equipmentTrainingTarget(buildView(profile, false).inventory[0], 'bancho')
    expect(equipmentTrainingEnd(buildView(profile, false), target)).toBeUndefined() // Merely meeting attributes does not equip or end it.
    expect(equipItem(profile, 'bancho', 'armor', armor.id).ok).toBe(true)
    const done = equipmentTrainingEnd(buildView(profile, false), target)!
    expect(done).toContain(locale === 'ja' ? '装備したため' : 'Equipped successfully')
    profile.party.members.bancho.equip.armor = null
    profile.party.members.samurai.allocated.str = 8; profile.party.members.samurai.allocated.vit = 10
    expect(equipItem(profile, 'samurai', 'armor', armor.id).ok).toBe(true)
    const moved = equipmentTrainingEnd(buildView(profile, false), target)!
    expect(moved).toContain(locale === 'ja' ? 'サムライ' : 'Samurai')
    expect(moved).toContain(locale === 'ja' ? '別の出撃メンバー' : 'Another deployed companion')
    // A reserve-held item remains a valid comparison source; do not silently discard that goal.
    profile.party.order = [...profile.party.order.filter(job => job !== 'samurai'), 'samurai']
    expect(equipmentTrainingEnd(buildView(profile, false), target)).toBeUndefined()
    profile.party.members.samurai.equip.armor = null; profile.inventory = []
    const gone = equipmentTrainingEnd(buildView(profile, false), target)!
    expect(gone).toContain(locale === 'ja' ? '持ち物からなくなった' : 'no longer in your inventory')
    if (locale === 'en') expect(done + moved + gone).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
  })
  it('opens both reserve and member disclosures and focuses allocation without selecting a command', () => {
    const focus = vi.fn(), scrollIntoView = vi.fn()
    const root = { querySelector: vi.fn() }, reserve = { tagName: 'DETAILS', open: false, parentElement: root }, detail = { open: false }
    const card = { parentElement: reserve, querySelector: (selector: string) => selector === 'details' ? detail : selector === '.attribute-panel' ? { scrollIntoView } : { focus } }
    root.querySelector.mockReturnValue(card)
    expect(focusEquipmentTraining(root as unknown as HTMLElement, 'bancho')).toBe(true)
    expect(root.querySelector).toHaveBeenCalledWith('[data-job="bancho"]')
    expect(reserve.open).toBe(true); expect(detail.open).toBe(true)
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
    expect(scrollIntoView).toHaveBeenCalledOnce()
  })
  it('copies unlocked depths into the view without exposing mutable progress state', () => {
    const profile = newProfile('test'), view = buildView(profile, false)
    expect(view.dungeon.unlockedDepths).toEqual([1, 0, 0])
    view.dungeon.unlockedDepths[0] = 50
    expect(profile.progress.unlockedDepths).toEqual([1, 0, 0])
  })
})
