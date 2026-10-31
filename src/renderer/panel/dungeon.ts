import type { Command, ProfileView } from '../../core/index.ts'
import { difficulties, dungeonBalance } from '../../core/data/dungeon.ts'
import { favoredLootSlots, lootTendency } from '../../core/data/loot.ts'
import { slots } from '../../core/data/items.ts'
import { h } from './dom'
import { formatNumber, translatedLabel, registerTranslations, registerTranslationTemplates } from '../../shared/i18n'
import { renderAbyssRecords } from './abyssRecords'
import { spriteImage } from './portrait'
import { canTravelTo, DungeonTravelDraft, nearbyLootFloors } from './dungeonTravel'
import './dungeon.css'
import { renderNextBoss } from './nextBoss'

registerTranslations({
  '狙う装備で行き先を選ぶ': 'Choose a destination for your next find',
  '現在の区域': 'Current area',
  '現在地': 'You are here',
  '予約済み': 'Queued',
  '同じ深さ・基礎性能の目安も同じ': 'Same depth and base-stat range',
  '浅い階は戦いやすい一方、同じ希少度なら装備の基礎性能も低い傾向です。数値にはランダム幅があります。': 'Shallower floors are easier, but equipment of the same rarity tends to have lower base stats. Individual rolls still vary.',
  '他の種類も出ます。確定報酬ではありません。': 'Other equipment types still drop. These are tendencies, not guaranteed rewards.',
  '未到達': 'Not reached',
  '次のウェーブから移動します。': 'Travel begins with the next wave.',
})
registerTranslationTemplates([
  { ja: '移動予約：{difficulty} B{depth}', en: 'Travel queued: {difficulty} B{depth}' },
  { ja: '{slot}が出やすい', en: 'More likely to find: {slot}' },
  { ja: 'B{depth}へ移動', en: 'Travel to B{depth}' },
  { ja: '現在より{n}階浅い・基礎性能は低い傾向', en: '{n} floors shallower · generally lower base stats' },
  { ja: '現在より{n}階深い・基礎性能は高い傾向', en: '{n} floors deeper · generally higher base stats' },
])

export function renderDungeon(v: ProfileView, command: (command: Command) => Promise<unknown>, draft = new DungeonTravelDraft()) {
  const d = v.dungeon
  const depart = h('button', { type: 'submit', 'data-focus-key': 'travel-submit', disabled: !canTravelTo(d, Number(draft.value(d))) }, '出発')
  const floor = h('input', { type: 'number', min: 1, max: d.best, step: 1, required: true, value: draft.value(d), 'data-focus-key': 'travel-floor', 'aria-label': '探索する地下階',
    oninput: (event: Event) => { const input = event.target as HTMLInputElement; draft.edit(input.value); depart.disabled = !canTravelTo(d, input.valueAsNumber) } })
  const destinations = nearbyLootFloors(d.depth, d.best), currentArea = lootTendency(d.depth)
  return h('section', {},
    h('div', { class: 'dungeon-heading' },
      h('div', {}, h('span', { class: 'eyebrow' }, `${translatedLabel(d.name)} / ${translatedLabel(d.difficultyLabel)}`), h('h2', {}, d.town ? '街で休息中' : `地下 ${d.depth} 階`),
        h('p', {}, `${d.theme} ・最高到達 B${d.best} ・ ${d.floorLimit === null ? '終わりなき深淵' : `${d.floorLimit}階踏破で次の難度へ`}`)),
      d.town ? h('button', { class: 'buy', onclick: () => void command({ c: 'selectStage', stageNo: d.depth }) }, '探索を再開')
        : h('button', { class: 'return-town', onclick: () => void command({ c: 'returnTown' }) }, '街へ帰還')),
    h('div', { class: 'difficulty-tabs' }, ...difficulties.map(difficulty => h('button', { class: d.difficulty === difficulty.id ? 'active' : '', disabled: difficulty.id > d.unlockedDifficulty || difficulty.id === d.difficulty || (d.pendingTravel?.difficulty === difficulty.id && d.pendingTravel.depth === 1), onclick: () => void command({ c: 'selectStage', stageNo: 1, depthRank: difficulty.id }) },
      `${difficulty.name}${difficulty.floorLimit === null ? ' ∞' : ' 100階'}${difficulty.id > d.unlockedDifficulty ? '（未解放）' : ''}`))),
    d.pendingTravel ? h('p', { class: 'travel-pending', role: 'status' }, `移動予約：${translatedLabel(difficulties[d.pendingTravel.difficulty].name)} B${d.pendingTravel.depth}`, ' — ', '次のウェーブから移動します。') : null,
    renderNextBoss(v),
    h('section', { class: 'loot-destinations' }, h('h3', {}, '狙う装備で行き先を選ぶ'),
      ...favoredLootSlots.map((_, index) => {
        const tendency = lootTendency(index * dungeonBalance.themeSpan + 1), destination = destinations[index]
        const current = destination === d.depth && !d.town
        const queued = destination !== undefined && d.pendingTravel?.depth === destination && d.pendingTravel.difficulty === d.difficulty
        return h('div', { class: 'loot-destination' },
          h('div', {}, h('b', {}, tendency.areaName), tendency.areaNo === currentArea.areaNo ? h('small', {}, '現在の区域') : null,
            h('p', {}, `${translatedLabel(slots[tendency.favoredSlot].name)}が出やすい`),
            destination === undefined ? null : h('small', {}, destination < d.depth ? `現在より${d.depth - destination}階浅い・基礎性能は低い傾向` : destination > d.depth ? `現在より${destination - d.depth}階深い・基礎性能は高い傾向` : '同じ深さ・基礎性能の目安も同じ')),
          h('button', { disabled: destination === undefined || !canTravelTo(d, destination), 'data-focus-key': `loot-destination-${index}`, onclick: () => {
            if (destination !== undefined && canTravelTo(d, destination)) void command({ c: 'selectStage', stageNo: destination })
          } }, destination === undefined ? '未到達' : current ? '現在地' : queued ? '予約済み' : `B${destination}へ移動`))
      }), h('p', { class: 'hint' }, '他の種類も出ます。確定報酬ではありません。'),
      h('p', { class: 'hint' }, '浅い階は戦いやすい一方、同じ希少度なら装備の基礎性能も低い傾向です。数値にはランダム幅があります。')),
    h('div', { class: 'loop-row' },
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: v.stage.loop, onchange: (event: Event) => void command({ c: 'setLoop', loop: (event.target as HTMLInputElement).checked }) }),
        h('span', {}, '同じ階を周回する（OFFで下へ進む）')),
      h('span', { class: 'rates' }, `小判 ${v.rates.kobanPerMin}/分  経験値 ${v.rates.expPerMin}/分`)),
    h('p', { class: 'hint' }, '各階で10ウェーブ。10階ごとに大ボスが待ち受け、宝箱や祭壇が見つかることもあります。帰還しても装備や育成は失いません。'),
    h('form', { class: 'floor-jump', onsubmit: (event: Event) => { event.preventDefault(); if (floor.reportValidity() && canTravelTo(d, floor.valueAsNumber)) void command({ c: 'selectStage', stageNo: floor.valueAsNumber }) } },
      h('label', {}, '到達済みの階へ ', floor),
      depart),
    h('p', { class: 'hint' }, '通常と修羅は100階まで。深淵だけ100階を超えて進めます。3回続けて全滅すると、前の階で鍛え直して再挑戦します。'),
    d.difficulty === 2 ? renderAbyssRecords(d.abyss, job => spriteImage(job, 2)) : null,
    h('dl', { class: 'record' },
      ...([['撃破', formatNumber(v.stats.kills)], ['ボス撃破', formatNumber(v.stats.bossKills)], ['ステージクリア', formatNumber(v.stats.stageClears)], ['全滅', formatNumber(v.stats.wipes)],
        ['累計小判', formatNumber(v.totalKoban)], ['プレイ時間', `${Math.floor(v.stats.playMs / 3600000)}時間${Math.floor(v.stats.playMs / 60000) % 60}分`]] as const)
        .map(([k, value]) => h('div', {}, h('dt', {}, k), h('dd', {}, value)))))
}
