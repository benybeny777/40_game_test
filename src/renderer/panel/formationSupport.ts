import { jobs, roleLabels } from '../../core/data/jobs.ts'
import { formationSupport, type FormationCapability, type FormationMember } from '../../core/progress/formationSupport.ts'
import { formatNumber, registerTranslations, registerTranslationTemplates, translatedLabel as tr } from '../../shared/i18n'
import { h } from './dom'
import './formationSupport.css'

registerTranslations({
  '編成の特徴': 'Formation profile',
  '技能と守りの詳細': 'Skills and protection details',
  'なし': 'None',
  '攻撃役': 'Attackers',
  '仲間の回復': 'Ally healing',
  '守りと妨害': 'Protection and disruption',
  '変更前': 'Before',
  '変更後': 'After',
  '該当する通常技能なし': 'No matching regular skill',
  '攻撃役なし。守り・支援に寄る編成です。他の役割も通常攻撃を行います。': 'No attacker-role companion. This trio leans toward protection and support; other roles still make normal attacks.',
  '仲間を回復する通常技能なし。連戦では残りHPと移動中の回復を確認してください。': 'No regular ally-healing skill. Watch remaining HP and recovery between waves.',
  '仲間を守る・敵を弱める': 'Protect allies or weaken enemies',
  '本人を守る': 'Personal protection',
  '自己復活': 'Self-revival',
  '解放済みの自己復活なし': 'No unlocked self-revival',
  '自己復活のみ。仲間の回復・蘇生はできません。1戦に1回です。': 'Self-revival only, once per battle. This does not heal or revive companions.',
  '装備・ステ振りでも戦い方が変わります。': 'Equipment and attribute choices also change how this trio fights.',
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

const capabilityNames = (entries: readonly FormationCapability[]) => entries.map(entry => `${tr(jobs[entry.job].name)} / ${tr(entry.skill.name)}`).join(' · ')
function traitRows(support: ReturnType<typeof formationSupport>) {
  const traits = support.traits
  const protection = [
    traits.partyProtection.length ? `${tr('仲間を守る・敵を弱める')}: ${capabilityNames(traits.partyProtection)}` : '',
    traits.selfProtection.length ? `${tr('本人を守る')}: ${capabilityNames(traits.selfProtection)}` : '',
  ].filter(Boolean).join(' / ')
  return [
    { key: 'attack', label: '攻撃役', text: traits.attackers.length ? traits.attackers.map(job => tr(jobs[job].name)).join(' · ') : tr('攻撃役なし。守り・支援に寄る編成です。他の役割も通常攻撃を行います。') },
    { key: 'heal', label: '仲間の回復', text: traits.allyHealing.length ? capabilityNames(traits.allyHealing) : tr('仲間を回復する通常技能なし。連戦では残りHPと移動中の回復を確認してください。') },
    { key: 'guard', label: '守りと妨害', text: protection || tr('該当する通常技能なし') },
  ]
}

export function renderFormationSupport(members: readonly FormationMember[], preview = false, previous?: readonly FormationMember[]) {
  const support = formationSupport(members)
  const before = previous ? formationSupport(previous) : undefined
  const oldRows = before ? traitRows(before) : undefined
  const revival = capabilityNames(support.traits.selfRevival)
  const oldRevival = before ? capabilityNames(before.traits.selfRevival) : undefined
  const rows = traitRows(support)
  const changed = (index: number) => Boolean(preview && oldRows && oldRows[index].text !== rows[index].text)
  const rowElement = (row: typeof rows[number], index: number) => h('div', { class: 'formation-trait', 'data-trait': row.key },
    h('strong', {}, row.label),
    changed(index) ? h('p', { class: 'formation-before' }, `${tr('変更前')}: ${oldRows![index].text}`) : null,
    h('p', {}, changed(index) ? `${tr('変更後')}: ` : '', row.text))
  const revivalChanged = preview && oldRevival !== undefined && oldRevival !== revival
  const revivalElement = revival || oldRevival ? h('div', { class: 'formation-trait' },
    h('strong', {}, '自己復活'),
    revivalChanged ? h('p', { class: 'formation-before' }, `${tr('変更前')}: ${oldRevival || tr('解放済みの自己復活なし')}`) : null,
    h('p', {}, revivalChanged ? `${tr('変更後')}: ` : '', revival || tr('解放済みの自己復活なし')),
    revival ? h('p', { class: 'hint' }, '自己復活のみ。仲間の回復・蘇生はできません。1戦に1回です。') : null) : null
  const lost = before ? before.synergies.filter(old => old.ready && !support.synergies.some(next => next.id === old.id && next.ready)) : []
  return h('section', { class: 'formation-support' },
    h('h3', {}, preview ? '交換後の3人' : '現在戦う3人の連携'),
    preview ? h('p', {}, members.map(formationOption).join(' / ')) : null,
    h('div', { class: 'formation-traits' },
      h('h4', {}, '編成の特徴'),
      h('p', { class: 'formation-summary' }, `${tr('攻撃役')}: ${support.traits.attackers.map(job => tr(jobs[job].name)).join(' · ') || tr('なし')} / ${tr('仲間の回復')}: ${support.traits.allyHealing.map(entry => tr(jobs[entry.job].name)).join(' · ') || tr('なし')}`),
      ...rows.flatMap((row, index) => changed(index) ? [rowElement(row, index)] : []),
      revivalChanged ? revivalElement : null,
      h('details', {}, h('summary', { 'data-focus-key': preview ? 'preview-formation-details' : 'current-formation-details' }, '技能と守りの詳細'),
        ...rows.flatMap((row, index) => changed(index) ? [] : [rowElement(row, index)]),
        revivalChanged ? null : revivalElement,
        h('p', { class: 'hint' }, '装備・ステ振りでも戦い方が変わります。'))),
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
