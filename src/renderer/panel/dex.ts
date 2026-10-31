import type { ProfileView } from '../../core/index.ts'
import { dungeons } from '../../core/data/dungeon.ts'
import { enemyGuide } from '../../shared/enemyGuide'
import { bossPattern } from '../../core/data/bossPatterns.ts'
import { textElement } from './dom'
import { renderBossPhase } from './bossPhase'

type Portrait = (id: string, scale: number, silhouette?: boolean) => HTMLCanvasElement
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) {
  return textElement(tag, className, text)
}

export function renderDex(view: ProfileView, portrait: Portrait): HTMLElement {
  const root = element('section')
  root.append(element('h2', '妖怪図鑑'), element('p', `発見 ${view.dex.filter(enemy => enemy.seen).length} / ${view.dex.length}種。姿と特徴を知り、次の編成に生かそう。`, 'hint'))
  for (const [index, biome] of dungeons.yomi.biomes.entries()) {
    root.append(element('h3', biome))
    const grid = element('div', undefined, 'dex')
    for (const enemy of view.dex.filter(entry => entry.area === index + 1)) {
      const card = element('article', undefined, `entry${enemy.seen ? '' : ' unseen'}`)
      card.append(portrait(enemy.id, 2, !enemy.seen), element('h4', enemy.seen ? enemy.name : '未発見'))
      if (enemy.seen) {
        const context = { floor: view.dungeon.depth, depthRank: view.dungeon.difficulty }
        const guide = enemyGuide(enemy.id, context)
        const pattern = bossPattern(enemy.id, context.floor, context.depthRank)
        card.append(element('b', guide.role))
        if (pattern) card.append(element('small', '現在の進行帯での技'), element('b', pattern.skill.name))
        if (!pattern?.late) card.append(element('p', enemy.desc))
        card.append(element('p', guide.tactic, 'hint'))
        const phase = renderBossPhase(pattern?.secondPhase)
        if (phase) card.append(phase)
        if (enemy.boss) card.append(element('small', '10階ごとの大ボス。弱ると攻撃が速くなる。'))
      } else card.append(element('p', enemy.boss ? 'この区域の主。出会って特徴を確かめよう。' : '探索を進めると発見できる。', 'hint'))
      grid.append(card)
    }
    root.append(grid)
  }
  return root
}
