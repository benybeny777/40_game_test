import type { JobId, MemberView } from '../../core/index.ts'
import { getLocale } from '../../shared/i18n'
import { h } from './dom'
import { spriteImage } from './portrait'
import './characterPicker.css'

type CharacterChoice = Pick<MemberView, 'job' | 'name' | 'lv' | 'role' | 'color' | 'active' | 'fighting'>

/** Native buttons retain keyboard activation; selection stays in the caller's UI state. */
export function renderCharacterPicker(party: readonly CharacterChoice[], selectedJob: JobId | null,
  onChoose: (job: JobId) => void, focusPrefix = 'character') {
  const en = getLocale() === 'en'
  return h('div', { class: 'character-picker', role: 'group', 'aria-label': en ? 'Choose a companion' : 'キャラを選ぶ' },
    ...party.map(member => {
      const selected = member.job === selectedJob
      const status = member.fighting
        ? member.active ? en ? 'Deployed' : '出撃中' : en ? 'Deployed · Swap queued' : '出撃中・交代予約'
        : member.active ? en ? 'Deployment queued' : '出撃予約' : en ? 'Reserve' : '控え'
      const portrait = spriteImage(member.job, 2)
      portrait.setAttribute('aria-hidden', 'true')
      return h('button', { type: 'button', class: 'character-choice', style: `--job:${member.color}`,
        'aria-pressed': String(selected), 'data-focus-key': `${focusPrefix}-${member.job}`,
        onclick: () => onChoose(member.job) },
      h('span', { class: 'character-choice-portrait' }, portrait),
      h('span', { class: 'character-choice-info' },
        h('strong', {}, member.name), h('small', {}, `Lv ${member.lv}`), h('span', { class: 'character-choice-role' }, member.role),
        h('small', { class: 'character-choice-status' }, status)),
      h('span', { class: 'character-choice-selected', 'aria-hidden': 'true' }, selected ? '✓' : ''))
    }))
}
