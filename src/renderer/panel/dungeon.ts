import type { Command, ProfileView } from '../../core/index.ts'
import { difficulties } from '../../core/data/dungeon.ts'
import { h } from './dom'
import { formatNumber, translatedLabel } from '../../shared/i18n'

export function renderDungeon(v: ProfileView, command: (command: Command) => Promise<unknown>) {
  const d = v.dungeon
  let targetFloor = d.depth
  return h('section', {},
    h('div', { class: 'dungeon-heading' },
      h('div', {}, h('span', { class: 'eyebrow' }, `${translatedLabel(d.name)} / ${translatedLabel(d.difficultyLabel)}`), h('h2', {}, d.town ? '街で休息中' : `地下 ${d.depth} 階`),
        h('p', {}, `${d.theme} ・最高到達 B${d.best} ・ ${d.floorLimit === null ? '終わりなき深淵' : `${d.floorLimit}階踏破で次の難度へ`}`)),
      d.town ? h('button', { class: 'buy', onclick: () => void command({ c: 'selectStage', stageNo: d.depth }) }, '探索を再開')
        : h('button', { class: 'return-town', onclick: () => void command({ c: 'returnTown' }) }, '街へ帰還')),
    h('div', { class: 'difficulty-tabs' }, ...difficulties.map(difficulty => h('button', { class: d.difficulty === difficulty.id ? 'active' : '', disabled: difficulty.id > d.unlockedDifficulty, onclick: () => void command({ c: 'selectStage', stageNo: 1, depthRank: difficulty.id }) },
      `${difficulty.name}${difficulty.floorLimit === null ? ' ∞' : ' 100階'}${difficulty.id > d.unlockedDifficulty ? '（未解放）' : ''}`))),
    h('div', { class: 'loop-row' },
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: v.stage.loop, onchange: (event: Event) => void command({ c: 'setLoop', loop: (event.target as HTMLInputElement).checked }) }),
        h('span', {}, '同じ階を周回する（OFFで下へ進む）')),
      h('span', { class: 'rates' }, `小判 ${v.rates.kobanPerMin}/分  経験値 ${v.rates.expPerMin}/分`)),
    h('p', { class: 'hint' }, '各階で10ウェーブ。10階ごとに大ボスが待ち受け、宝箱や祭壇が見つかることもあります。帰還しても装備や育成は失いません。'),
    h('form', { class: 'floor-jump', onsubmit: (event: Event) => { event.preventDefault(); void command({ c: 'selectStage', stageNo: targetFloor }) } },
      h('label', {}, '到達済みの階へ ', h('input', { type: 'number', min: 1, max: d.best, step: 1, value: d.depth, 'aria-label': '探索する地下階', oninput: (event: Event) => { targetFloor = Number((event.target as HTMLInputElement).value) } })),
      h('button', { type: 'submit' }, '出発')),
    h('p', { class: 'hint' }, '通常と修羅は100階まで。深淵だけ100階を超えて進めます。3回続けて全滅すると、前の階で鍛え直して再挑戦します。'),
    h('dl', { class: 'record' },
      ...([['撃破', formatNumber(v.stats.kills)], ['ボス撃破', formatNumber(v.stats.bossKills)], ['ステージクリア', formatNumber(v.stats.stageClears)], ['全滅', formatNumber(v.stats.wipes)],
        ['累計小判', formatNumber(v.totalKoban)], ['プレイ時間', `${Math.floor(v.stats.playMs / 3600000)}時間${Math.floor(v.stats.playMs / 60000) % 60}分`]] as const)
        .map(([k, value]) => h('div', {}, h('dt', {}, k), h('dd', {}, value)))))
}
