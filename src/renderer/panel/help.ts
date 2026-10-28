import { attributeBalance, attributeKeys, attributeLabels, type AttributeKey } from '../../core/data/attributes.ts'
import { difficulties, dungeonBalance } from '../../core/data/dungeon.ts'
import { itemBalance, rarities } from '../../core/data/items.ts'
import { defaultFormation, jobs, partyOrder, partySize, roleLabels, type JobRole } from '../../core/data/jobs.ts'
import { getLocale, translatedLabel } from '../../shared/i18n'
import './translations'
import { textElement as node } from './dom'

function paragraph(text: string) { return node('p', 'help-text', text) }
function list(items: string[]) {
  const element = node('ul', 'help-list')
  for (const text of items) element.append(node('li', '', text))
  return element
}
function section(title: string, ...children: HTMLElement[]) {
  const element = node('details', 'help-section')
  element.append(node('summary', 'help-section-title', title))
  const body = node('div', 'help-section-body'); body.append(...children); element.append(body)
  return element
}

function renderEnglishHelp(): HTMLElement {
  const root = node('section', 'help-root')
  root.append(node('h2', 'help-title', 'How to play'), paragraph('Build a party, descend underground and find equipment in this auto battle RPG. Improve your companions to reach deeper floors.'))
  const steps = node('ol', 'help-steps')
  const starting = defaultFormation.slice(0, partySize).map(id => translatedLabel(jobs[id].name)).join(', ')
  for (const [title, text] of [
    ['Choose your companions', `Deploy ${partySize} companions from ${partyOrder.length} jobs in Party. Start with ${starting} if you are unsure.`],
    ['Compare your loot', 'Battles run automatically. Open Equipment to compare stats and requirements. Auto equip can select stronger gear. Lock items you want to keep.'],
    ['Return to town when needed', 'Use Return to town in Dungeon to recover. Keep your progress and gear, then resume from any reached floor.'],
  ]) { const step = node('li', 'help-step'); step.append(node('b', 'help-step-title', title), paragraph(text)); steps.append(step) }
  root.append(node('h3', 'help-subtitle', 'Start with these three steps'), steps)
  const roles = node('div', 'help-role-grid')
  const descriptions: Record<JobRole, string> = {
    tank: 'Takes enemy attacks and protects companions.', attacker: 'Defeats enemies through single target, repeated or area attacks.',
    healer: 'Restores HP, removes debuffs or protects against lethal damage.', buffer: 'Improves allies’ attacks and action speed.', debuffer: 'Weakens enemy attacks or slows their actions.',
  }
  for (const role of Object.keys(roleLabels) as JobRole[]) {
    const members = partyOrder.filter(id => jobs[id].role === role), card = node('article', `help-role help-role-${role}`)
    card.append(node('h4', 'help-role-title', `${translatedLabel(roleLabels[role])} · ${members.length}`), paragraph(descriptions[role]), paragraph(members.map(id => translatedLabel(jobs[id].name)).join(', '))); roles.append(card)
  }
  root.append(section('Party and roles', paragraph(`Deploy ${partySize} companions. The first member is the front line. Swaps and order changes apply next wave; they do not reset the enemies or HP mid battle.`), roles,
    paragraph('Try a tank, an attacker and a healer or support. This is a suggestion, not a requirement; other combinations are welcome.'),
    paragraph('Only the three companions actually deployed in battle gain experience. Reserves gain no experience and retain their existing levels, growth and equipment. This change affects future earnings; previously earned levels are not reduced. Reserve skills, luck and equipment effects do not contribute to active combat or loot bonuses.'),
    paragraph('Offline experience is assigned to the companions deployed during the absence. Changing the party before claiming rewards does not transfer that experience to other companions.')))
  root.append(section('Attribute points and focused builds', paragraph(`Each level grants ${attributeBalance.pointsPerLevel} points. Assign them manually or automatically in Party. Check the job’s main attribute and equipment requirements.`),
    list(['STR improves attack for STR based jobs, defense and equipment eligibility.', 'DEX affects attack interval, critical chance and evasion. DEX based jobs also gain attack.', 'VIT improves maximum HP and defense. Use it when your party falls too quickly.', 'INT improves attack for INT based jobs and equipment eligibility. Some healing skills also scale with attack.',
      'Turn auto allocation off to assign points yourself. Use all spends every unspent point on one attribute. Focused builds may sacrifice survival or equipment options.',
      'Reset points is free. It refunds all points and turns auto allocation off. Gear whose requirements are no longer met returns to the bag.'])))
  root.append(section('Equipment and requirements', paragraph('Equipment requires the correct job and attribute values. There is no character level requirement. Item rank describes the quality of an item, not the character level needed to equip it.'),
    list([`Base stats vary from ${Math.round(itemBalance.baseRollMin * 100)}% to ${Math.round(itemBalance.baseRollMax * 100)}%, with different extra effects. Compare items against your build, not just their rarity color.`,
      `There are ${rarities.length} rarities: ${rarities.map(rarity => translatedLabel(rarity.name)).join(', ')}. ${translatedLabel(rarities[itemBalance.uniqueRarity].name)} includes unique items with special names and effects.`,
      'If an item cannot be equipped, read its job, type and attribute requirements. Builds of the same job may qualify for different items.', 'Auto equip selects eligible gear using current stats. Lock valuable items to protect them from auto selling and bulk selling.'])))
  root.append(section('Difficulty, town and repeat mode', list([
    'Normal and Nightmare each have 100 floors. Clear Normal to unlock Nightmare, then clear Nightmare to unlock Abyss. Only Abyss has no floor limit.',
    `A major boss appears every ${dungeonBalance.bossEvery} floors. Other floors end with an elite wave.`,
    'Return to town stops exploration and restores HP. You retain equipment and growth. Resume from a reached floor in an unlocked difficulty.',
    'Repeat mode farms the current floor for equipment. Turn it off to descend.', 'Some floors contain a chest or altar. Repeating the same discovery does not grant its reward again.'])))
  root.append(section('Windows and browser controls',
    paragraph('Windows: click companions or labels on the transparent band to open the panel. Empty space passes clicks through to the app behind it. Closing the panel keeps the game running. Use the system tray to pause, hide the band or quit.'),
    paragraph('Browser: closing the game tab ends the game. Saves belong to this browser and site. Other browsers and devices use separate data. Clearing site data may erase your save; there is no automatic sync to Windows.'),
    paragraph('Windows and browser saves are separate. Development and user profiles are separate too.')))
  root.append(section('Saving and recovery', paragraph('Progress saves automatically during play and after actions. If a save error appears, check the message; do not assume saving succeeded.'),
    list(['Saves from a newer version and damaged saves are never automatically deleted. Preserve the original data before recovery.', 'Avoid repeatedly overwriting after a save error. Check the save location and protect the original before resuming.', 'Cosmetic ownership is separate from adventure gear and koban. Editing a save does not grant paid cosmetics.'])))
  root.append(section('Cosmetic store and Steam trading', paragraph('Cosmetics change the ground appearance without affecting stats, experience or drop rates. Preview any cosmetic for 30 seconds; cancel or wait for it to expire to restore the previous appearance.'),
    list(['Sales have not started. Coming soon products cannot be purchased. Development test items never charge real money.', 'Steam item trading is in preparation. Local adventure equipment and koban cannot be sold or traded on Steam.', 'If a purchase result is unconfirmed, wait for verification without purchasing the same item again.'])))
  return root
}

export function renderHelp(): HTMLElement {
  if (getLocale() === 'en') return renderEnglishHelp()
  const root = node('section', 'help-root')
  const intro = node('div', 'help-intro')
  intro.append(node('span', 'help-eyebrow', '迷ったときの旅支度'), node('h2', 'help-title', 'あそびかた'),
    paragraph('仲間を編成して地下へ潜り、拾った装備と育成で、少しずつ深い階を目指すオートバトルRPGです。'))
  root.append(intro)

  const start = node('section', 'help-start')
  start.append(node('h3', 'help-subtitle', '最初は、この3つだけ'))
  const steps = node('ol', 'help-steps')
  const startingParty = defaultFormation.slice(0, partySize).map(id => jobs[id].name).join('・')
  for (const [title, text] of [
    ['仲間を選ぶ', `「パーティ」で${partyOrder.length}ジョブから${partySize}人を編成します。迷ったら初期の${startingParty}で始められます。`],
    ['拾った装備を比べる', '戦闘は自動です。「装備」で能力と装備条件を確認し、必要なら「強い装備を自動で装備」を使います。残したい品はロックします。'],
    ['無理せず、街へ帰る', '苦しくなったら「ダンジョン」で街へ帰還します。育成・装備を整えて、到達済みの階から再出発できます。'],
  ]) {
    const step = node('li', 'help-step'); step.append(node('b', 'help-step-title', title), paragraph(text)); steps.append(step)
  }
  start.append(steps); root.append(start)

  const roles = node('div', 'help-role-grid')
  const roleDescriptions: Record<JobRole, string> = {
    tank: '敵の攻撃を引き受けて仲間を守る役。', attacker: '敵を倒す役。単体・連撃・範囲など、得意な攻め方が違います。',
    healer: 'HP回復や弱体の解除、致命傷への備えで支える役。', buffer: '仲間の攻撃や行動速度を強化する役。', debuffer: '敵の攻撃力や行動速度を下げ、戦いを有利にする役。',
  }
  for (const role of Object.keys(roleLabels) as JobRole[]) {
    const card = node('article', `help-role help-role-${role}`)
    const members = partyOrder.filter(id => jobs[id].role === role)
    card.append(node('h4', 'help-role-title', `${roleLabels[role]} · ${members.length}人`), paragraph(roleDescriptions[role]),
      node('p', 'help-role-members', members.map(id => jobs[id].name).join('・')))
    roles.append(card)
  }
  root.append(section('編成とロール',
    paragraph(`出撃は${partySize}人です。先頭が前衛で、並び替え・控えとの交代は次のウェーブから反映されます。戦闘中の変更で、その場の敵やHPをリセットすることはありません。`),
    roles,
    paragraph('基本は「タンク＋アタッカー＋回復か支援」。必須ではなく、攻撃重視や妨害重視の編成も試せます。'),
    paragraph('経験値は実際に戦う出撃3人だけが獲得します。控えは経験値を獲得せず、現在のレベル・育成状態・装備を保持します。変更はこれからの獲得に適用し、過去に上がったレベルは下げません。控えのスキル・運・装備効果は、出撃中の戦闘やドロップ補正に加算されません。'),
    paragraph('オフライン経験値の対象は不在時の出撃メンバーです。受け取る前に編成を変更しても、経験値を別の仲間へ移すことはできません。')))

  const attributes = node('dl', 'help-attributes')
  const attributeDescriptions: Record<AttributeKey, string> = {
    str: '筋力を主属性に持つジョブの攻撃と防御、装備条件に関わります。',
    dex: '攻撃間隔・会心・回避に関わり、敏捷が主属性のジョブは攻撃も伸びます。',
    vit: '最大HPと防御を伸ばします。攻撃に寄せすぎて倒れやすいときの選択肢です。',
    int: '知力を主属性に持つジョブの攻撃と装備条件に関わります。回復など、攻撃力を参照するスキルにもつながります。',
  }
  for (const key of attributeKeys) {
    const row = node('div', 'help-attribute-row')
    row.append(node('dt', '', `${key.toUpperCase()} · ${attributeLabels[key]}`), node('dd', '', attributeDescriptions[key])); attributes.append(row)
  }
  root.append(section('育成ポイントと、極振りの考え方',
    paragraph(`レベルが上がると${attributeBalance.pointsPerLevel}ポイントを使えます。「パーティ」の主属性と装備条件を見て、手動または自動で振り分けます。`),
    attributes,
    list(['迷ったら自動振りをON。手動で振るときは、自動振りをOFFにします。',
      '「全振り」は未使用ポイントを一つの属性へまとめて使います。火力を伸ばせる一方、耐久や装備条件が足りなくなることもあります。',
      '無料で振り直せます。振り直すと全ポイントが戻り、自動振りはOFFになります。条件を満たさなくなった装備は持ち物へ戻ります。'])))

  const rollMin = Math.round(itemBalance.baseRollMin * 100), rollMax = Math.round(itemBalance.baseRollMax * 100)
  root.append(section('装備選びと、装備できないとき',
    paragraph('装備する条件はジョブと属性値です。キャラのレベル制限はありません。装備に表示されるアイテムLvは品の等級で、装着に必要なキャラLvではありません。'),
    list(['装備できない品は、表示されたジョブ・種類・属性の条件を確認します。同じジョブでも配分によって扱える品が変わります。',
      `同じ種類でも基礎性能に${rollMin}〜${rollMax}%の幅があり、追加効果も変わります。レア度の色だけでなく、自分の編成に合うかを見て比べます。`,
      `レア度は${rarities.map(rarity => rarity.name).join('・')}の${rarities.length}段階。${rarities[itemBalance.uniqueRarity].name}には、固有の名前と効果を持つユニーク装備もあります。`,
      '自動装備は、今の能力と条件で扱える品から選びます。後で使いたい品はロックして、自動売却や一括売却から守ります。'])))

  const difficultyCards = node('div', 'help-difficulties')
  for (const difficulty of difficulties) {
    const card = node('article', 'help-difficulty')
    card.append(node('h4', 'help-difficulty-title', difficulty.name),
      paragraph(difficulty.floorLimit === null ? '階層上限のない、長く挑める難度です。' : `地下${difficulty.floorLimit}階の突破が目標です。`))
    difficultyCards.append(card)
  }
  root.append(section('難度・帰還・周回',
    difficultyCards,
    paragraph(`${difficulties[0].name}の最深階を突破すると${difficulties[1].name}、さらに突破すると${difficulties[2].name}が解放されます。無限に潜るのは${difficulties[2].name}だけです。`),
    list([`${dungeonBalance.bossEvery}階ごとに大きなボスが待ちます。それ以外の階も最後のウェーブには精鋭が出ます。`,
      '「街へ帰還」で探索を止めて全快できます。装備や育成は失いません。再出発は到達済みの階と解放済みの難度から選びます。',
      '周回モードは今の階を繰り返して装備を探すための設定です。先へ進みたいときはOFFにします。',
      '宝箱や祭壇のある階もあります。同じ発見を繰り返し利用して報酬を増やすことはできません。'])))

  const desktop = node('article', 'help-platform-card')
  desktop.append(node('h4', 'help-platform-title', 'Windows版'), list([
    '透明な帯の仲間や表示をクリックすると管理パネルが開きます。帯の空いた部分は背後のアプリへクリックが通ります。',
    '管理パネルを閉じてもゲームは常駐します。一時停止・帯の表示切替・終了は、タスクトレイのアイコンから操作します。',
    'ブラウザー版とは別のセーブを使います。開発用のセーブと利用者用のセーブも分かれています。',
  ]))
  const browser = node('article', 'help-platform-card')
  browser.append(node('h4', 'help-platform-title', 'ブラウザー版'), list([
    'ゲームのタブを閉じると終了します。Windowsのタスクトレイには常駐しません。',
    '同じブラウザー・同じサイトの保存領域を使います。別のブラウザーや端末では別のデータです。',
    'ブラウザーのデータ削除でセーブが消えることがあります。Windows版への自動同期はありません。',
  ]))
  const platforms = node('div', 'help-platforms'); platforms.append(desktop, browser)
  root.append(section('操作と、Windows版・ブラウザー版の違い', platforms))

  root.append(section('セーブと、読み込めないとき',
    paragraph('プレイ中や操作の区切りで自動保存します。保存できない通知が出たときは、成功したと決めつけず画面の案内を確認してください。'),
    list(['このバージョンより新しいセーブや、壊れたセーブを自動削除しません。読み込めない場合は、元のデータを保護して復旧を確認します。',
      '保存エラーの表示があるまま新しいセーブで上書きを繰り返さないでください。保存場所や元のデータを確認してから再開します。',
      '外観ストアの所有記録と、冒険の装備・小判は別に管理されます。セーブの書換えで有料商品の所有権を得ることはできません。'])))

  root.append(section('外観ストアとSteamアイテム取引',
    paragraph('外観ストアは足元の見た目を変えるためのものです。能力・経験値・ドロップ率に影響しません。購入前でも30秒間試着でき、取り消すか時間が来ると元に戻ります。'),
    list(['現在は販売前です。「販売準備中」の商品は購入できません。開発テスト表示での取得に実決済はありません。',
      'Steamアイテム取引は準備中です。本編のローカル装備や小判をSteamで売買することはできません。',
      '購入結果が未確認という表示が出たら、同じ商品を繰り返し購入せず、記録の確認を待ちます。'])))
  return root
}
