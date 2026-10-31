import { jobs, roleLabels } from '../../core/data/jobs.ts'
import { formationSupport, type FormationMember } from '../../core/progress/formationSupport.ts'
import { formatNumber, registerTranslations, registerTranslationTemplates, translatedLabel as tr } from '../../shared/i18n'
import { h } from './dom'
import './formationSupport.css'

registerTranslations({
  '現在戦う3人の連携': 'Synergies of the three currently fighting',
  '交換後の3人': 'Your trio after this swap',
  '条件を満たすと発動': 'Available when the combat condition is met',
  '育成で解放': 'Unlock through training',
  '専用連携なし。役割や装備を組み合わせた編成も選べます。': 'No dedicated synergy. Compositions built around roles and equipment are also valid.',
  '編成だけで常時発動する効果ではありません。技能の状態条件と必要レベルを確認してください。': 'These effects are not permanently active just by forming a party. Check skill conditions and required levels.',
  '出撃時の育成支援': 'Catch-up bonus while deployed',
  '控えに経験値は入りません。倍率は現在のレベル差に応じた上限で、追いつくと下がります。オフライン報酬は対象外です。': 'Reserves gain no experience. These are current maximum multipliers based on the level gap; they decrease as companions catch up. Offline rewards are excluded.',
  '交換を確定': 'Confirm swap',
  '交換を取り消す': 'Cancel swap',
  '変更前に使える連携': 'Available synergy before this change',
  '次のウェーブから反映されます。': 'Takes effect at the next wave.',
  'ギャルの注目マークが残る敵をメイドが優先し、その敵への初弾が会心になります。': 'The Maid prioritizes enemies still marked by the Gyaru, and her opening knife against a marked enemy is a critical hit.',
  '巫女の結界・禊が有効な間、被弾して生き残った番長の反撃が強まります。': 'While the Miko’s barrier or purification is active, the Bancho counters more strongly after surviving a hit.',
  'ガリ勉が敵の攻撃を遅くしている間、スケバンのその敵への攻撃が強まります。': 'While the Bookworm slows an enemy’s attacks, the Sukeban deals stronger attacks to that enemy.',
  '刻印を含む実際の威力と再使用時間は、各キャラの技能欄で確認できます。': 'Check each companion’s skills for actual power and cooldown, including engravings.',
})
const conditions = {
  attention: 'ギャルの注目マークが残る敵をメイドが優先し、その敵への初弾が会心になります。',
  ward: '巫女の結界・禊が有効な間、被弾して生き残った番長の反撃が強まります。',
  slow: 'ガリ勉が敵の攻撃を遅くしている間、スケバンのその敵への攻撃が強まります。',
} as const
registerTranslationTemplates([
  { ja: '{name}・{role}・Lv{n}', en: '{name} · {role} · Lv{n}' },
  { ja: '{name}：最大{n}倍', en: '{name}: up to {n}x' },
  { ja: '{name} Lv{current} / 必要Lv{required}・{skill}', en: '{name} Lv{current} / requires Lv{required} · {skill}' },
])

export function formationOption(member: FormationMember) {
  const job = jobs[member.job]
  return tr(`${tr(job.name)}・${tr(roleLabels[job.role])}・Lv${member.lv}`)
}

export function renderFormationSupport(members: readonly FormationMember[], preview = false, previous?: readonly FormationMember[]) {
  const support = formationSupport(members)
  const lost = previous ? formationSupport(previous).synergies.filter(old => old.ready && !support.synergies.some(next => next.id === old.id && next.ready)) : []
  return h('section', { class: 'formation-support' },
    h('h3', {}, preview ? '交換後の3人' : '現在戦う3人の連携'),
    preview ? h('p', {}, members.map(formationOption).join(' / ')) : null,
    ...support.synergies.map(link => h('div', { class: `formation-link${link.ready ? '' : ' locked'}` },
      h('strong', {}, link.requirements.map(entry => tr(entry.skill.name)).join(' → ')),
      h('small', {}, link.ready ? '条件を満たすと発動' : '育成で解放'),
      ...link.requirements.map(entry => h('p', {}, `${tr(jobs[entry.job].name)} Lv${entry.level} / 必要Lv${entry.requiredLevel}・${tr(entry.skill.name)}`)),
      h('p', {}, conditions[link.id]))),
    support.synergies.length ? h('p', { class: 'hint' }, '編成だけで常時発動する効果ではありません。技能の状態条件と必要レベルを確認してください。')
      : h('p', { class: 'hint' }, '専用連携なし。役割や装備を組み合わせた編成も選べます。'),
    support.synergies.length ? h('p', { class: 'hint' }, '刻印を含む実際の威力と再使用時間は、各キャラの技能欄で確認できます。') : null,
    ...lost.map(link => h('p', { class: 'formation-lost' }, '変更前に使える連携', '：', link.requirements.map(entry => tr(entry.skill.name)).join(' → '))),
    h('details', {}, h('summary', { 'data-focus-key': preview ? 'preview-training-support' : 'current-training-support' }, '出撃時の育成支援'),
      ...support.training.map(member => h('p', {}, `${tr(jobs[member.job].name)}：最大${formatNumber(member.multiplier, { maximumFractionDigits: 2 })}倍`)),
      h('p', { class: 'hint' }, '控えに経験値は入りません。倍率は現在のレベル差に応じた上限で、追いつくと下がります。オフライン報酬は対象外です。')))
}
