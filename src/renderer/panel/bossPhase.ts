import type { bossPattern } from '../../core/data/bossPatterns.ts'
import { registerTranslations } from '../../shared/i18n'
import { h } from './dom'

registerTranslations({
  '100階ごとの山場：HP半分から技が変化': 'Hundred-floor climax: the skill changes at half HP',
})
export function renderBossPhase(phase: NonNullable<ReturnType<typeof bossPattern>>['secondPhase']) {
  return phase ? h('div', { class: 'boss-second-phase' },
    h('strong', {}, '100階ごとの山場：HP半分から技が変化'), h('b', {}, phase.skill.name), h('p', {}, phase.description)) : null
}
