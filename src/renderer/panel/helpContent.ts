import { attributeBalance, attributeKeys, attributeLabels, type AttributeKey } from '../../core/data/attributes.ts'
import { balance } from '../../core/data/balance.ts'
import { difficulties, dungeonBalance } from '../../core/data/dungeon.ts'
import { itemBalance, rarities } from '../../core/data/items.ts'
import { defaultFormation, jobs, partyOrder, partySize, roleLabels, type JobRole } from '../../core/data/jobs.ts'
import { getLocale, translatedLabel as tr } from '../../shared/i18n'

export type HelpBlock = { kind: 'paragraph'; text: string } | { kind: 'list'; items: string[] }
  | { kind: 'cards'; className: string; cards: Array<{ className: string; title: string; blocks: HelpBlock[] }> }
  | { kind: 'attributes'; rows: Array<{ term: string; description: string }> }
const paragraph = (text: string): HelpBlock => ({ kind: 'paragraph', text })
const list = (items: string[]): HelpBlock => ({ kind: 'list', items })

/** Text and facts only. Both languages use exactly the same sections and DOM renderer. */
export function getHelpContent() {
  const en = getLocale() === 'en', text = (ja: string, english: string) => en ? english : ja
  const starting = defaultFormation.slice(0, partySize).map(id => tr(jobs[id].name)).join(en ? ', ' : '・')
  const roleDescriptions: Record<JobRole, string> = {
    tank: text('敵の攻撃を引き受けて仲間を守る役。', 'Takes enemy attacks and protects companions.'),
    attacker: text('敵を倒す役。単体・連撃・範囲など、得意な攻め方が違います。', 'Defeats enemies through single-target, repeated or area attacks.'),
    healer: text('HP回復や弱体の解除、致命傷への備えで支える役。', 'Restores HP, removes debuffs or protects against lethal damage.'),
    buffer: text('仲間の攻撃や行動速度を強化する役。', 'Improves allies’ attacks and action speed.'),
    debuffer: text('敵の攻撃力や行動速度を下げ、戦いを有利にする役。', 'Weakens enemy attacks or slows their actions.'),
  }
  const attributeDescriptions: Record<AttributeKey, string> = {
    str: text('筋力が主属性のジョブの攻撃と防御、装備条件に関わります。', 'Improves attack for STR-based jobs, defense and equipment eligibility.'),
    dex: text('攻撃間隔・会心・回避に関わり、敏捷が主属性のジョブは攻撃も伸びます。', 'Affects attack interval, critical chance and evasion. DEX-based jobs also gain attack.'),
    vit: text('最大HPと防御を伸ばします。倒れやすいときの選択肢です。', 'Improves maximum HP and defense. Use it when your party falls too quickly.'),
    int: text('知力が主属性のジョブの攻撃と装備条件に関わります。攻撃力を参照する回復スキルも伸びます。', 'Improves attack for INT-based jobs and equipment eligibility. Healing skills that scale with attack also benefit.'),
  }
  const sections: Array<{ id: string; title: string; blocks: HelpBlock[] }> = [
    { id: 'party', title: text('編成とロール', 'Party and roles'), blocks: [
      paragraph(text(`出撃は${partySize}人。先頭が前衛です。並び替え・控えとの交代は次のウェーブから反映されます。戦闘中に敵やHPをリセットすることはありません。`, `Deploy ${partySize} companions. The first member is the front line. Swaps and order changes apply next wave; they do not reset enemies or HP mid-battle.`)),
      { kind: 'cards', className: 'help-role-grid', cards: (Object.keys(roleLabels) as JobRole[]).map(role => {
        const members = partyOrder.filter(id => jobs[id].role === role)
        return { className: `help-role help-role-${role}`, title: `${tr(roleLabels[role])} · ${members.length}${en ? '' : '人'}`, blocks: [paragraph(roleDescriptions[role]), paragraph(members.map(id => tr(jobs[id].name)).join(en ? ', ' : '・'))] }
      }) },
      paragraph(text('基本は「タンク＋アタッカー＋回復か支援」。必須ではなく、攻撃重視や妨害重視の編成も試せます。', 'Try a tank, an attacker and a healer or support. This is a suggestion, not a requirement; other combinations are welcome.')),
      paragraph(text('経験値は実際に戦う出撃3人だけが獲得します。控えは経験値を獲得せず、現在のレベル・育成・装備を保持します。過去に上がったレベルは下げません。控えのスキル・運・装備効果は戦闘やドロップ補正に加算されません。', 'Only the three companions actually deployed gain experience. Reserves gain no experience and retain their growth and equipment; previously earned levels are not reduced. Reserve skills, luck and gear effects do not contribute to active combat or loot bonuses.')),
      paragraph(text('オフライン経験値は不在時の出撃メンバーが対象です。受領前の編成変更で別の仲間へ移せません。街で休んでいる間は放置報酬を獲得しません。', 'Offline experience belongs to the companions deployed during the absence. Changing the party before claiming rewards does not transfer that experience. Resting in town does not earn offline rewards.')),
      paragraph(text('出撃中の先輩より4レベル以上低い仲間には、戦闘経験値が最大3倍になる育成支援が付きます。差が3まで縮むと終了します。控えやオフライン報酬には付きません。', 'A deployed companion at least 4 levels behind the highest-level participant receives up to 3× battle EXP. The bonus ends at a 3-level gap. Reserves and offline rewards do not receive this bonus.')),
      list([
        text('ギャルの注目マークが付いた敵へメイドがナイフを集中し、初弾が会心になります。', 'The Maid focuses her knife volleys on enemies marked by the Gyaru, with a guaranteed critical opening hit.'),
        text('ガリ勉などが敵の攻撃間隔を延ばすと、スケバンの追い込みがHPに関係なく働きます。', 'When the Bookworm or another effect slows enemy attacks, the Sukeban gains her pursuit damage bonus regardless of enemy HP.'),
        text('巫女の結界・禊で守られている番長は、反撃も強くなります。', 'The Bancho counters harder while protected by the Shrine Maiden’s ward or purification.'),
      ]),
    ] },
    { id: 'attributes', title: text('育成ポイントと、極振りの考え方', 'Attribute points and focused builds'), blocks: [
      paragraph(text(`レベル上限は${balance.maxLevel}。レベルが上がると${attributeBalance.pointsPerLevel}ポイントを使えます。「パーティ」の主属性と装備条件を見て、手動または自動で振り分けます。`, `The level cap is ${balance.maxLevel}. Each level grants ${attributeBalance.pointsPerLevel} points. Assign them manually or automatically in Party. Check the job’s main attribute and equipment requirements.`)),
      paragraph(text('配分の主な目的は、使いたい装備の条件を満たすことです。属性による攻撃・耐久などの直接効果は、振るほど伸びが緩やかになります。上限に達しても、装備探しと無料の振り直しで組み方を変えられます。', 'Allocate attributes primarily to qualify for the equipment you want. Direct benefits such as attack and durability have diminishing returns. At the level cap, keep finding gear and use free resets to change your build.')),
      paragraph(text('道場では移動・装備探し・不在時の報酬を支援します。攻撃力や最大HPを道場で積み上げる仕組みはありません。戦闘力は装備と配分、編成を見直して伸ばしましょう。', 'The dojo supports travel, finding gear and offline rewards. It does not stack attack or maximum HP upgrades. Improve combat strength through equipment, allocation and party choices.')),
      { kind: 'attributes', rows: attributeKeys.map(key => ({ term: `${key.toUpperCase()} · ${tr(attributeLabels[key])}`, description: attributeDescriptions[key] })) },
      list([
        text('迷ったら自動振りをON。手動で振るときは、自動振りをOFFにします。', 'Turn auto allocation on for a balanced start, or off to assign points yourself.'),
        text('「全振り」は未使用ポイントを一つの属性へまとめて使います。高い属性値を要求する強い装備を使える一方、耐久や他の装備条件を犠牲にすることもあります。', 'Use all spends every unspent point on one attribute. This can unlock powerful gear with high attribute requirements, at the cost of survival or other equipment options.'),
        text('無料で振り直せます。全ポイントが戻り、自動振りはOFFになります。条件を満たさなくなった装備は持ち物へ戻ります。', 'Reset points is free. It refunds all points and turns auto allocation off. Gear whose requirements are no longer met returns to the bag.'),
      ]),
    ] },
    { id: 'equipment', title: text('装備選びと、装備できないとき', 'Equipment and requirements'), blocks: [
      paragraph(text('装備条件はジョブと属性値だけ。キャラのレベル制限はありません。「装備ランク」は品の等級で、装着に必要なキャラLvではありません。', 'Equipment requires the correct job and attribute values. There is no character level requirement. Item rank describes quality, not a required character level.')),
      paragraph(text('弱い序盤装備のままでは節目のボスで行き詰まります。ただし、ランクだけで毎回買い替える必要はありません。追加効果・技能刻印・固有効果が編成に合う良いレア装備は、長く使えます。', 'Weak starting gear will hold you back at milestone bosses. You do not need to replace every item just because a higher rank drops. Good rare gear can last when its affixes, skill engravings or unique effects suit your party.')),
      list([
        text('地下1階の初回突破武器は自動装備せず、比較して選べます。持ち物が満杯なら整理売却の対象になるため、空きを用意しましょう。', 'The weapon awarded for your first clear of B1 is held for comparison rather than auto-equipped. Make room in your bag: full-inventory sales can include this reward.'),
        text(`それ以外のボスでない階の突破では、出撃者の空き枠を優先し、次に現在階の基準に比べ基礎性能が低い武器・防具へ向けて、${tr(rarities[0].name)}か${tr(rarities[1].name)}の装備を1個補給します。同じ階の再周回でも受け取れます。必ず今より強い品や装備可能な品になるとは限らないので、条件と性能を比べましょう。`, `Other non-boss floor clears supply one ${tr(rarities[0].name)} or ${tr(rarities[1].name)} item for deployed companions, prioritizing empty slots, then weapons or armor with weaker base stats relative to the current floor. Repeating the same floor also grants supplies. A supply is not guaranteed to be stronger or equippable; compare its requirements and stats.`),
        text('装備できない品は、表示されたジョブ・種類・属性の条件を確認します。同じジョブでも配分によって扱える品が変わります。', 'If an item cannot be equipped, read its job, type and attribute requirements. Builds of the same job may qualify for different items.'),
        text('属性だけが足りない品は「この装備に向けて育成」から対象キャラへ移れます。不足値を見て配分し、「比較へ戻る」で装備を選びます。目標はいつでも外せます。', 'When only attributes are missing, use Train for this equipment to open that companion. Allocate points, then return to comparison to choose the item. You can remove the goal anytime.'),
        text(`基礎性能には${Math.round(itemBalance.baseRollMin * 100)}〜${Math.round(itemBalance.baseRollMax * 100)}%の幅があり、追加効果も変わります。色や評価値だけでなく、各能力と自分の組み方を比べます。`, `Base stats vary from ${Math.round(itemBalance.baseRollMin * 100)}% to ${Math.round(itemBalance.baseRollMax * 100)}%, with different extra effects. Compare individual stats with your build, not just color or the overall score.`),
        text(`レア度は${rarities.map(rarity => tr(rarity.name)).join('・')}の${rarities.length}段階。${tr(rarities[itemBalance.uniqueRarity].name)}には固有の名前と効果を持つユニーク装備もあります。`, `There are ${rarities.length} rarities: ${rarities.map(rarity => tr(rarity.name)).join(', ')}. ${tr(rarities[itemBalance.uniqueRarity].name)} includes unique items with special names and effects.`),
        text('自動装備は、出撃中の仲間にとって能力が下がらない上位品を選びます。固有装備や、装備中のロックした品は勝手に入れ替えません。性能に交換条件がある品は自分で比べて選びます。', 'Auto equip chooses upgrades that do not lower stats for deployed companions. It does not automatically equip unique items or replace worn unique or locked gear. Choose items with tradeoffs yourself.'),
        text(`所持上限は${itemBalance.inventoryMax}個です。自動売却が「売らない」でも、満杯になると未装備・未ロック品のうちレア度、次に装備ランクが低い品を売ります。すべて保護中なら、新しく拾った品（確定報酬を含む）が売られます。売られた品名と小判を画面に表示します。`, `Inventory holds ${itemBalance.inventoryMax} items. Even with auto sell set to Never, a full bag sells an unequipped, unlocked item with the lowest rarity, then the lowest item rank. If every stored item is protected, the new drop is sold, including guaranteed rewards. The sold item and koban are shown on screen.`),
        text('後で使いたい品はロックすると、自動売却や一括売却から守れます。', 'Lock items you want to keep to protect them from auto selling and bulk selling.'),
      ]),
    ] },
    { id: 'dungeon', title: text('難度・帰還・周回', 'Difficulty, town and repeat mode'), blocks: [
      { kind: 'cards', className: 'help-difficulties', cards: difficulties.map(difficulty => ({ className: 'help-difficulty', title: tr(difficulty.name), blocks: [paragraph(difficulty.floorLimit === null ? text('階層上限のない、長く挑める難度です。', 'An open-ended challenge with no floor limit.') : text(`地下${difficulty.floorLimit}階の突破が目標です。`, `Clear all ${difficulty.floorLimit} floors.`))] })) },
      paragraph(text(`${tr(difficulties[0].name)}の最深階を突破すると${tr(difficulties[1].name)}、さらに突破すると${tr(difficulties[2].name)}が解放されます。無限に潜るのは${tr(difficulties[2].name)}だけです。`, `Clear ${tr(difficulties[0].name)} to unlock ${tr(difficulties[1].name)}, then clear it to unlock ${tr(difficulties[2].name)}. Only ${tr(difficulties[2].name)} has unlimited floors.`)),
      list([
        text(`${dungeonBalance.bossEvery}階ごとに大きなボスが待ちます。それ以外の階も最後のウェーブには精鋭が出ます。`, `A major boss appears every ${dungeonBalance.bossEvery} floors. Other floors end with an elite wave.`),
        text('「街へ帰還」で探索を止めて全快できます。装備や育成は失いません。到達済みの階と解放済みの難度から再出発できます。', 'Return to town stops exploration and restores HP without losing gear or growth. Resume from a reached floor in an unlocked difficulty.'),
        text('周回モードは今の階を繰り返して装備を探す設定です。先へ進みたいときはOFFにします。', 'Repeat mode farms the current floor for equipment. Turn it off to descend.'),
        text('3回続けて全滅すると前の階で育成します。同じ壁への再挑戦に敗れると、育成周回が2回から4回、最大8回へ増えます。迷宮画面から待たずに再挑戦することもできます。', 'Three consecutive defeats trigger farming on an earlier floor. Losing a prepared retry increases farming from two clears to four, then eight at most. You can queue a retry without waiting from the Dungeon screen.'),
        text('宝箱や祭壇のある階もあります。同じ発見から繰り返し報酬は受け取れません。', 'Some floors contain a chest or altar. Repeating the same discovery does not grant its reward again.'),
      ]),
    ] },
    { id: 'controls', title: text('操作と、Windows版・ブラウザー版の違い', 'Windows and browser controls'), blocks: [
      { kind: 'cards', className: 'help-platforms', cards: [
        { className: 'help-platform-card', title: text('Windows版', 'Windows'), blocks: [list([
          text('帯の仲間や表示をクリックすると管理パネルが開きます。空いた部分は背後のアプリへクリックが通ります。', 'Click companions or labels on the band to open the panel. Empty space passes clicks through to the app behind it.'),
          text('管理パネルを閉じてもゲームは常駐します。一時停止・帯の表示切替・終了は、タスクトレイのアイコンから操作します。', 'Closing the panel keeps the game running. Use the system tray to pause, hide the band or quit.'),
        ])] },
        { className: 'help-platform-card', title: text('ブラウザー版', 'Browser'), blocks: [list([
          text('ゲームのタブを閉じると終了します。Windowsのタスクトレイには常駐しません。', 'Closing the game tab ends the game. It does not stay in the Windows system tray.'),
          text('セーブはブラウザーとサイトごとに別です。サイトのデータ削除で消えることがあるため、必要ならセーブを書き出してください。', 'Each browser and site has separate saves. Clearing site data can erase them; export your save when needed.'),
        ])] },
      ] },
      paragraph(text('Windowsとブラウザーの端末内セーブは別です。同じアカウントのクラウドセーブを使うと、手動で進行を移せます。', 'Local Windows and browser saves are separate. Use the same cloud account to transfer progress manually.')),
    ] },
    { id: 'cloud', title: text('クラウドセーブ', 'Cloud saves'), blocks: [
      paragraph(text('接続先が設定されている場合、「設定」から登録・ログインして手動で保存・読込できます。自動同期ではありません。', 'When a server is configured, register or log in from Settings to save and load manually. This is not automatic sync.')),
      list([
        text('読込はこの端末の進行を置き換えます。残したい進行は先に書き出してください。読込後は一時停止します。', 'Loading replaces progress on this device. Export any progress you want to keep first. The game pauses after loading.'),
        text('別端末の保存と競合したら、上書きせず最新状態を確認します。通信結果が不明なときは保存を繰り返さないでください。', 'If another device saves first, refresh the cloud state instead of overwriting it. Do not repeat a save while its result is unknown.'),
        text('再起動後は再ログインします。クラウド未接続でも端末内に保存して遊べます。', 'Log in again after restarting. You can still play with local saves when cloud saving is unavailable.'),
      ]),
    ] },
    { id: 'sound', title: text('節目の通知音', 'Milestone sounds'), blocks: [
      paragraph(text('通知音は最初はOFFです。「設定」でONにすると、伝説・神話の入手、10階ごとの突破、10レベルごとの成長を短い音で知らせます。通常攻撃では鳴りません。', 'Sound is off by default. Enable it in Settings for short cues on legendary or mythic loot, each ten-floor milestone and every ten levels. Ordinary attacks are silent.')),
      list([
        text('音量も設定できます。一時停止・非表示中には鳴らさず、通知が続きすぎないよう回数を抑えます。', 'Adjust the volume in Settings. Sounds pause while the game is paused or hidden, and notifications are limited to avoid constant noise.'),
        text('ブラウザーでは画面のクリックやキー操作のあとに音が有効になります。', 'Browsers enable playback after a click or key press in the game.'),
        text('再生エラーが出た場合は案内を確認し、通知音を一度OFFにしてからONにすると再試行できます。', 'If playback fails, check the error and switch sound off, then on, to retry.'),
      ]),
    ] },
    { id: 'save', title: text('セーブと、読み込めないとき', 'Saving and recovery'), blocks: [
      paragraph(text('プレイ中や操作の区切りで自動保存します。保存エラーが出たときは画面の案内を確認してください。', 'Progress saves automatically during play and after actions. If saving fails, follow the message on screen.')),
      list([
        text('新しい版のセーブや壊れたセーブは自動削除しません。読めない場合も、元のデータを消さずに保護してください。', 'Saves from a newer version and damaged saves are not automatically deleted. Preserve the original data if it cannot be loaded.'),
        text('保存エラー中は上書きを繰り返さず、セーブを書き出して進行を保護してください。', 'Do not repeatedly overwrite after a save error. Export your save to protect your progress.'),
      ]),
    ] },
    { id: 'store', title: text('外観の試着と適用', 'Previewing and applying appearances'), blocks: [
      paragraph(text('外観ストアは足元の見た目を変えます。能力・経験値・ドロップ率は変わりません。30秒間試着でき、取り消すか時間が来ると元に戻ります。', 'Cosmetics change the ground appearance without affecting stats, experience or drop rates. Preview them for 30 seconds; cancel or wait to restore the previous appearance.')),
      list([
        text('「外観」で足元の見た目を試着できます。取得済みの外観は「この外観を使う」で適用します。', 'Use Appearance to preview ground styles. Choose Equip cosmetic to apply an appearance you already own.'),
        text('「既定の足元に戻す」で元の見た目へ戻せます。本編で拾った装備や小判は変わりません。', 'Use default ground restores the original appearance. Adventure equipment and koban remain unchanged.'),
      ]),
    ] },
  ]
  return {
    eyebrow: text('迷ったときの旅支度', 'Prepare for the next descent'), title: text('あそびかた', 'How to play'),
    intro: text('仲間を編成して地下へ潜り、拾った装備と育成で、少しずつ深い階を目指すオートバトルRPGです。', 'Build a party, descend underground and find equipment in this auto-battle RPG. Improve your companions to reach deeper floors.'),
    startTitle: text('最初は、この3つだけ', 'Start with these three steps'),
    steps: [
      { title: text('仲間を選ぶ', 'Choose your companions'), body: text(`「パーティ」で${partyOrder.length}ジョブから${partySize}人を編成します。迷ったら初期の${starting}で始められます。`, `Deploy ${partySize} companions from ${partyOrder.length} jobs in Party. Start with ${starting} if you are unsure.`) },
      { title: text('拾った装備を比べる', 'Compare your loot'), body: text('地下1階を突破したら「装備」へ。最初の武器を今の品と比べ、自分で「装備する」を選びます。残したい品はロックしましょう。', 'After clearing B1, open Equipment. Compare your first weapon with your current gear and choose Equip yourself. Lock items you want to keep.') },
      { title: text('無理せず、街へ帰る', 'Return to town when needed'), body: text('苦しくなったら「ダンジョン」で街へ帰還。育成・装備を整えて、到達済みの階から再出発できます。', 'Use Return to town in Dungeon to recover. Improve your build and gear, then resume from any reached floor.') },
    ], sections,
  }
}
