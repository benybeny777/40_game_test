import type { ProfileView, JobId } from '../../core/index.ts'
import { jobs } from '../../core/data/jobs.ts'
import { enemies } from '../../core/data/enemies.ts'
import { bossSkillById } from '../../core/data/bossPatterns.ts'
import { difficulties } from '../../core/data/dungeon.ts'
import { formatNumber, registerTranslations, registerTranslationTemplates, translatedLabel as tr } from '../../shared/i18n'
import { h } from './dom'
import './defeatReview.css'
import { canTravelTo } from './dungeonTravel'

registerTranslations({
  '直近の敗北を振り返る': 'Review the last defeat',
  '突破実績のある階の敗北記録': 'Defeat record from a previously cleared floor',
  '記録の階へ再訪': 'Revisit the recorded floor',
  '別の迷宮の記録': 'Record from another dungeon',
  '現在地': 'You are here',
  '予約済み': 'Queued',
  '倒れた順と被ダメージを見る': 'View casualties and damage taken',
  '敗北したウェーブの記録です。同時に倒れた仲間は同順位。回復や蘇生を挟むため、被ダメージは最大HPを超えることがあります。': 'Recorded during the lost wave. Simultaneous casualties share a rank. Damage taken can exceed maximum HP after healing or revival.',
  '致命打': 'Final blow',
  '通常攻撃': 'Basic attack',
  '自爆': 'Self-destruct',
  '記録なし': 'Not recorded',
  '編成を見直す': 'Adjust formation',
  '防具を比較': 'Compare armor',
  '武器を比較': 'Compare weapons',
  '戦闘時間': 'Battle time',
  '残敵': 'Enemies remaining',
  '残敵HP': 'Remaining enemies’ HP',
  '戦闘時間は停止時間を除きます。残敵HPは、生き残った敵だけの合計最大HPに対する割合です。': 'Battle time excludes pauses. Remaining HP is measured against the combined maximum HP of surviving enemies only.',
  'この階へ再挑戦': 'Retry this floor',
  '倒れた順と残敵を見て、攻撃・守り・回復の組み合わせや武器・防具を見直せます。': 'Use the casualty order and surviving enemies to review offense, protection, healing, weapons and armor.',
})
registerTranslationTemplates([
  { ja: '倒れた順 {n}', en: 'Fall order: {n}' },
  { ja: '被ダメージ {n}', en: 'Damage taken: {n}' },
])

type Defeat = NonNullable<ProfileView['lastDefeat']>
export interface DefeatActions {
  formation: () => void
  equipment: (job: JobId, slot: 'weapon' | 'armor') => void
  retry: (record: Defeat) => void
}

/** Observed facts only: damage totals do not imply a particular build caused the defeat. */
export function renderDefeatReview(record: Defeat | null, actions: DefeatActions, resolved: boolean, dungeon: ProfileView['dungeon']) {
  if (!record) return null
  const canRetry = record.dungeonId === dungeon.id && canTravelTo(dungeon, record.floor, record.depthRank)
  const queued = dungeon.pendingTravel?.depth === record.floor && dungeon.pendingTravel.difficulty === record.depthRank
  const review = h('aside', { class: 'defeat-review', 'aria-label': '直近の敗北を振り返る' },
    h('div', { class: 'defeat-heading' }, h('strong', {}, '直近の敗北を振り返る'),
      h('span', {}, `${tr(difficulties[record.depthRank].name)} · B${record.floor} · Wave ${record.wave}`)),
    h('details', {}, h('summary', { 'data-focus-key': 'defeat-details' }, '倒れた順と被ダメージを見る'),
      h('p', {}, `${tr('戦闘時間')}: ${record.combatMs == null ? tr('記録なし') : `${formatNumber(record.combatMs / 1000, { maximumFractionDigits: 1 })}s`} · ${tr('残敵')}: ${record.remainingEnemies == null ? tr('記録なし') : formatNumber(record.remainingEnemies.count)}${record.remainingEnemies == null ? '' : ` · ${tr('残敵HP')}: ${formatNumber(record.remainingEnemies.hpRatio * 100, { maximumFractionDigits: 1 })}%`}`),
      h('p', { class: 'hint' }, '戦闘時間は停止時間を除きます。残敵HPは、生き残った敵だけの合計最大HPに対する割合です。'),
      h('div', { class: 'defeat-party' }, ...record.party.map(member => {
        const source = member.fatalSource
        const enemy = source ? enemies[source.enemyId] : null
        const skill = source?.skillId && source.skillId !== 'explode' ? bossSkillById(source.enemyId, source.skillId) : undefined
        if (source?.skillId && source.skillId !== 'explode' && !skill) throw new Error(`Unknown defeat skill: ${source.enemyId}/${source.skillId}`)
        const attack = !source ? '記録なし' : source.skillId === 'explode' ? '自爆' : skill ? skill.name : '通常攻撃'
        return h('article', {},
          h('h3', {}, `${tr(jobs[member.job].name)} · Lv ${member.lv}`),
          h('p', {}, member.fallOrder === null ? tr('記録なし') : `倒れた順 ${member.fallOrder}`),
          h('p', {}, `被ダメージ ${formatNumber(member.damageTaken, { maximumFractionDigits: 1 })}`),
          h('p', {}, `${tr('致命打')}: ${enemy ? `${tr(enemy.name)} / ${tr(attack)}` : tr('記録なし')}`),
          h('button', { 'data-focus-key': `defeat-weapon-${member.job}`, onclick: () => actions.equipment(member.job, 'weapon') }, '武器を比較'),
          h('button', { 'data-focus-key': `defeat-gear-${member.job}`, onclick: () => actions.equipment(member.job, 'armor') }, '防具を比較'))
      })),
      h('p', { class: 'hint' }, '敗北したウェーブの記録です。同時に倒れた仲間は同順位。回復や蘇生を挟むため、被ダメージは最大HPを超えることがあります。')),
    h('p', { class: 'hint' }, '倒れた順と残敵を見て、攻撃・守り・回復の組み合わせや武器・防具を見直せます。'),
    h('div', { class: 'defeat-actions' },
      h('button', { 'data-focus-key': 'defeat-formation', onclick: actions.formation }, '編成を見直す'),
      h('button', { 'data-focus-key': 'defeat-retry', disabled: !canRetry, onclick: () => { if (canRetry) actions.retry(record) } },
        !canRetry ? (record.dungeonId !== dungeon.id ? '別の迷宮の記録' : queued ? '予約済み' : '現在地') : resolved ? '記録の階へ再訪' : 'この階へ再挑戦')))
  return resolved ? h('details', { class: 'defeat-history' },
    h('summary', { 'data-focus-key': 'defeat-history' }, '突破実績のある階の敗北記録'), review) : review
}
