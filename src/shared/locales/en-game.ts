/** Stable display keys. Japanese source and save IDs stay in core; only presentation uses this dictionary. */
export const gameTranslations: Readonly<Record<string, { readonly ja: string; readonly en: string }>> = {
  "job.samurai.name": {
    "ja": "サムライ",
    "en": "Samurai"
  },
  "job.samurai.roleDetail": {
    "ja": "前衛・攻撃と盾",
    "en": "Frontline offense and protection"
  },
  "job.samurai.weapon": {
    "ja": "刀",
    "en": "Katana"
  },
  "job.samurai.attack.name": {
    "ja": "斬撃",
    "en": "Slash"
  },
  "job.samurai.skill.name": {
    "ja": "居合",
    "en": "Quick Draw"
  },
  "job.samurai.skill.desc": {
    "ja": "次の一撃が必ず会心になり、威力2.5倍",
    "en": "The next hit always crits and deals 2.5x damage."
  },
  "job.samurai.passive.name": {
    "ja": "仁王立ち",
    "en": "Immovable Stance"
  },
  "job.samurai.passive.desc": {
    "ja": "先頭にいると狙われやすく、受けるダメージ−15%。HP50%以下で攻撃+30%",
    "en": "At the front, draws more attacks and takes 15% less damage. Gains 30% ATK at 50% HP or less."
  },
  "job.samurai.ultimate.name": {
    "ja": "一閃",
    "en": "Flash Cut"
  },
  "job.samurai.ultimate.desc": {
    "ja": "前方の敵2体までに攻撃力×3.5。少数の強敵を斬り抜く",
    "en": "Deals 3.5x ATK damage to up to two front enemies, concentrating on a few tough foes."
  },
  "job.ninja.name": {
    "ja": "忍者",
    "en": "Ninja"
  },
  "job.ninja.roleDetail": {
    "ja": "速攻・回避",
    "en": "Fast attacks and evasion"
  },
  "job.ninja.weapon": {
    "ja": "忍具",
    "en": "Ninja Tools"
  },
  "job.ninja.attack.name": {
    "ja": "手裏剣",
    "en": "Shuriken"
  },
  "job.ninja.skill.name": {
    "ja": "影分身",
    "en": "Shadow Clone"
  },
  "job.ninja.skill.desc": {
    "ja": "3秒間、回避率+50%",
    "en": "Gains 50% evasion for 3 seconds."
  },
  "job.ninja.passive.name": {
    "ja": "急所突き",
    "en": "Vital Strike"
  },
  "job.ninja.passive.desc": {
    "ja": "HP30%以下の敵への会心率+25%",
    "en": "Gains 25% critical chance against enemies below 30% HP."
  },
  "job.ninja.ultimate.name": {
    "ja": "微塵隠れ",
    "en": "Vanishing Burst"
  },
  "job.ninja.ultimate.desc": {
    "ja": "敵全体に攻撃力×2.5、2秒間無敵",
    "en": "Deals 2.5x ATK damage to all enemies and becomes invulnerable for 2 seconds."
  },
  "job.jirai.name": {
    "ja": "地雷系",
    "en": "Jirai Girl"
  },
  "job.jirai.roleDetail": {
    "ja": "呪い・範囲",
    "en": "Curses and area damage"
  },
  "job.jirai.weapon": {
    "ja": "呪具",
    "en": "Cursed Tools"
  },
  "job.jirai.attack.name": {
    "ja": "病みハート弾",
    "en": "Troubled Heart"
  },
  "job.jirai.skill.name": {
    "ja": "地雷設置",
    "en": "Plant Mine"
  },
  "job.jirai.skill.desc": {
    "ja": "敵の足元に地雷。踏まれると範囲に攻撃力×2.5",
    "en": "Places a mine beneath the front enemy. Detonates for 2.5x ATK area damage when triggered."
  },
  "job.jirai.passive.name": {
    "ja": "重い愛",
    "en": "Heavy Affection"
  },
  "job.jirai.passive.desc": {
    "ja": "情念50以上で攻撃+25%、受けるダメージ+10%",
    "en": "At 50 Passion or more, gains 25% ATK but takes 10% more damage."
  },
  "job.jirai.ultimate.name": {
    "ja": "激重ラブボム",
    "en": "Overwhelming Love Bomb"
  },
  "job.jirai.ultimate.desc": {
    "ja": "敵全体に攻撃力×(2＋情念÷50)。情念は0に",
    "en": "Deals ATK x (2 + Passion / 50) damage to all enemies, then resets Passion to 0."
  },
  "job.otaku.name": {
    "ja": "オタク",
    "en": "Otaku"
  },
  "job.otaku.roleDetail": {
    "ja": "回復・応援",
    "en": "Healing and encouragement"
  },
  "job.otaku.weapon": {
    "ja": "ペンライト",
    "en": "Glow Stick"
  },
  "job.otaku.attack.name": {
    "ja": "ペンライト投げ",
    "en": "Glow Stick Toss"
  },
  "job.otaku.skill.name": {
    "ja": "差し入れ",
    "en": "Care Package"
  },
  "job.otaku.skill.desc": {
    "ja": "HPの割合が一番低い仲間を回復（攻撃力×3＋最大HPの10%）",
    "en": "Heals the ally with the lowest HP ratio for 3x ATK + 10% of their max HP."
  },
  "job.otaku.passive.name": {
    "ja": "推しへの愛",
    "en": "Devoted Fan"
  },
  "job.otaku.passive.desc": {
    "ja": "戦闘開始時、仲間全体の攻撃+10%",
    "en": "At battle start, grants all allies 10% ATK."
  },
  "job.otaku.ultimate.name": {
    "ja": "全力応援",
    "en": "All-Out Cheer"
  },
  "job.otaku.ultimate.desc": {
    "ja": "仲間全体のHPを30%回復し、8秒間攻撃間隔−20%",
    "en": "Heals all allies for 30% max HP and reduces their attack intervals by 20% for 8 seconds."
  },
  "job.pachipro.name": {
    "ja": "パチプロ",
    "en": "Pachinko Pro"
  },
  "job.pachipro.roleDetail": {
    "ja": "運・経済",
    "en": "Luck and income"
  },
  "job.pachipro.weapon": {
    "ja": "玉入れ",
    "en": "Pachinko Balls"
  },
  "job.pachipro.attack.name": {
    "ja": "玉はじき",
    "en": "Ball Shot"
  },
  "job.pachipro.skill.name": {
    "ja": "確変チャレンジ",
    "en": "Jackpot Chance"
  },
  "job.pachipro.skill.desc": {
    "ja": "当たれば10秒間、仲間全体の攻撃間隔−30%・小判+50%",
    "en": "On success, reduces all allies' attack intervals by 30% and increases Koban gains by 50% for 10 seconds."
  },
  "job.pachipro.passive.name": {
    "ja": "期待値計算",
    "en": "Expected Value"
  },
  "job.pachipro.passive.desc": {
    "ja": "獲得小判+15%",
    "en": "Increases Koban gains by 15%."
  },
  "job.pachipro.ultimate.name": {
    "ja": "大当たり",
    "en": "Jackpot"
  },
  "job.pachipro.ultimate.desc": {
    "ja": "出目N（1〜7）で敵全体に攻撃力×N。7なら小判ボーナス",
    "en": "Rolls N (1-7) and deals N x ATK damage to all enemies. Rolling 7 awards bonus Koban."
  },
  "job.miko.name": {
    "ja": "巫女",
    "en": "Shrine Maiden"
  },
  "job.miko.roleDetail": {
    "ja": "結界・回復",
    "en": "Wards and healing"
  },
  "job.miko.weapon": {
    "ja": "御幣",
    "en": "Ritual Wand"
  },
  "job.miko.attack.name": {
    "ja": "お札飛ばし",
    "en": "Paper Talisman"
  },
  "job.miko.skill.name": {
    "ja": "清めの結界",
    "en": "Purifying Ward"
  },
  "job.miko.skill.desc": {
    "ja": "仲間全員の弱体を解除し、HPを攻撃力×1＋最大HPの8%回復。5秒間被ダメージ−20%",
    "en": "Cleanses all allies and heals each for 1x ATK + 8% max HP. Reduces damage taken by 20% for 5 seconds."
  },
  "job.miko.passive.name": {
    "ja": "護身札",
    "en": "Protective Talisman"
  },
  "job.miko.passive.desc": {
    "ja": "戦闘開始時、仲間全員の被ダメージ−5%",
    "en": "At battle start, reduces all allies' damage taken by 5%."
  },
  "job.miko.ultimate.name": {
    "ja": "禊の大祓",
    "en": "Great Purification"
  },
  "job.miko.ultimate.desc": {
    "ja": "仲間全員の弱体を解除し、HPを35%回復。6秒間被ダメージ−30%",
    "en": "Cleanses all allies and heals each for 35% max HP. Reduces damage taken by 30% for 6 seconds."
  },
  "job.bancho.name": {
    "ja": "番長",
    "en": "Bancho"
  },
  "job.bancho.roleDetail": {
    "ja": "前衛・挑発と反撃",
    "en": "Frontline taunts and counters"
  },
  "job.bancho.weapon": {
    "ja": "鉄拳",
    "en": "Iron Fists"
  },
  "job.bancho.attack.name": {
    "ja": "鉄拳制裁",
    "en": "Iron Fist"
  },
  "job.bancho.skill.name": {
    "ja": "啖呵",
    "en": "Fighting Words"
  },
  "job.bancho.skill.desc": {
    "ja": "5秒間、射程内の敵から優先して狙われ、被ダメージ−25%",
    "en": "For 5 seconds, becomes the priority target of enemies in range and takes 25% less damage."
  },
  "job.bancho.passive.name": {
    "ja": "落とし前",
    "en": "Payback"
  },
  "job.bancho.passive.desc": {
    "ja": "被弾して生き残ると攻撃力×0.5で反撃。巫女の結界・禊の間は×0.65",
    "en": "After surviving a hit, counters for 0.5x ATK damage, increased to 0.65x while protected by the Shrine Maiden's ward or purification."
  },
  "job.bancho.ultimate.name": {
    "ja": "総長の一喝",
    "en": "Leader's Roar"
  },
  "job.bancho.ultimate.desc": {
    "ja": "敵全体に攻撃力×3。6秒間、自分の被ダメージ−40%",
    "en": "Deals 3x ATK damage to all enemies and reduces own damage taken by 40% for 6 seconds."
  },
  "job.gyaru.name": {
    "ja": "ギャル",
    "en": "Gyaru"
  },
  "job.gyaru.roleDetail": {
    "ja": "注目マーク・応援",
    "en": "Attention marks and encouragement"
  },
  "job.gyaru.weapon": {
    "ja": "デコスマホ",
    "en": "Decorated Phone"
  },
  "job.gyaru.attack.name": {
    "ja": "キラキラショット",
    "en": "Sparkle Shot"
  },
  "job.gyaru.skill.name": {
    "ja": "デコ撮影",
    "en": "Glam Snapshot"
  },
  "job.gyaru.skill.desc": {
    "ja": "近くの敵に注目マーク。6秒間その敵の被ダメージ＋20%",
    "en": "Marks a nearby enemy with Attention, increasing its damage taken by 20% for 6 seconds."
  },
  "job.gyaru.passive.name": {
    "ja": "アゲてこ",
    "en": "Keep It Up"
  },
  "job.gyaru.passive.desc": {
    "ja": "戦闘開始時、仲間全員の攻撃力＋5%",
    "en": "At battle start, grants all allies 5% ATK."
  },
  "job.gyaru.ultimate.name": {
    "ja": "バズライブ",
    "en": "Viral Live Stream"
  },
  "job.gyaru.ultimate.desc": {
    "ja": "6秒間、敵全体の被ダメージ＋30%、仲間全員の攻撃間隔−15%",
    "en": "For 6 seconds, increases all enemies' damage taken by 30% and reduces all allies' attack intervals by 15%."
  },
  "job.sukeban.name": {
    "ja": "スケバン",
    "en": "Sukeban"
  },
  "job.sukeban.roleDetail": {
    "ja": "前衛・威圧と追撃",
    "en": "Frontline intimidation and finishing strikes"
  },
  "job.sukeban.weapon": {
    "ja": "木刀",
    "en": "Wooden Sword"
  },
  "job.sukeban.attack.name": {
    "ja": "木刀一閃",
    "en": "Wooden Blade"
  },
  "job.sukeban.skill.name": {
    "ja": "威圧",
    "en": "Intimidation"
  },
  "job.sukeban.skill.desc": {
    "ja": "6秒間、敵全体の攻撃力−20%",
    "en": "Reduces all enemies' ATK by 20% for 6 seconds."
  },
  "job.sukeban.passive.name": {
    "ja": "追い込み",
    "en": "Finish Them"
  },
  "job.sukeban.passive.desc": {
    "ja": "HP35%以下、または攻撃間隔が延びた敵への与ダメージ＋30%。重複しない",
    "en": "Deals 30% more damage to enemies at 35% HP or less, or whose attack interval is increased. These conditions do not stack."
  },
  "job.sukeban.ultimate.name": {
    "ja": "夜露死苦斬り",
    "en": "Night Riders' Slash"
  },
  "job.sukeban.ultimate.desc": {
    "ja": "敵全体に攻撃力×3.5。6秒間、敵全体の攻撃力−25%",
    "en": "Deals 3.5x ATK damage to all enemies and reduces their ATK by 25% for 6 seconds."
  },
  "job.farmer.name": {
    "ja": "農民",
    "en": "Farmer"
  },
  "job.farmer.roleDetail": {
    "ja": "逃げ腰・竹槍の間合い",
    "en": "Timid attacks with a long bamboo spear"
  },
  "job.farmer.weapon": {
    "ja": "竹槍",
    "en": "Bamboo Spear"
  },
  "job.farmer.attack.name": {
    "ja": "竹槍突き",
    "en": "Bamboo Thrust"
  },
  "job.farmer.skill.name": {
    "ja": "串刺し",
    "en": "Piercing Thrust"
  },
  "job.farmer.skill.desc": {
    "ja": "前方72ドット以内の敵を3体まで、攻撃力×1.6で貫く",
    "en": "Pierces up to 3 enemies within 72 dots ahead for 1.6x ATK damage."
  },
  "job.farmer.passive.name": {
    "ja": "逃げ腰",
    "en": "Nervous Footwork"
  },
  "job.farmer.passive.desc": {
    "ja": "回避率＋8%。長い竹槍で恐る恐る間合いを取る",
    "en": "Gains 8% evasion. Cautiously keeps enemies at bamboo-spear range."
  },
  "job.farmer.ultimate.name": {
    "ja": "やけくそ突き",
    "en": "Desperate Thrust"
  },
  "job.farmer.ultimate.desc": {
    "ja": "敵全体に攻撃力×3、自分のHPを30%回復",
    "en": "Deals 3x ATK damage to all enemies and restores 30% of own max HP."
  },
  "job.maid.name": {
    "ja": "メイド",
    "en": "Maid"
  },
  "job.maid.roleDetail": {
    "ja": "高速ナイフ・連撃",
    "en": "Fast knives and multiple hits"
  },
  "job.maid.weapon": {
    "ja": "ナイフ",
    "en": "Knives"
  },
  "job.maid.attack.name": {
    "ja": "ナイフ投げ",
    "en": "Knife Toss"
  },
  "job.maid.skill.name": {
    "ja": "仕込みナイフ三連投",
    "en": "Concealed Triple Throw"
  },
  "job.maid.skill.desc": {
    "ja": "注目マークの敵を優先して攻撃力×0.65のナイフを3連投。注目中の敵への初弾は会心",
    "en": "Throws 3 knives for 0.65x ATK each, prioritizing marked enemies. The first hit against a marked enemy is a critical hit."
  },
  "job.maid.passive.name": {
    "ja": "鮮やかな手際",
    "en": "Practiced Hands"
  },
  "job.maid.passive.desc": {
    "ja": "通常攻撃の間隔−10%",
    "en": "Reduces normal attack interval by 10%."
  },
  "job.maid.ultimate.name": {
    "ja": "ナイフ・カーテン",
    "en": "Knife Curtain"
  },
  "job.maid.ultimate.desc": {
    "ja": "注目優先で攻撃力×0.75を6連投。注目中の敵への初弾は会心。6秒間自分の攻撃間隔−20%",
    "en": "Throws 6 knives for 0.75x ATK each, prioritizing marked enemies. The first hit against a marked enemy is critical. Reduces own attack interval by 20% for 6 seconds."
  },
  "job.jiangshi.name": {
    "ja": "キョンシー",
    "en": "Jiangshi"
  },
  "job.jiangshi.roleDetail": {
    "ja": "跳ね突き・一度きりの復活",
    "en": "Hopping strikes and a single revival"
  },
  "job.jiangshi.weapon": {
    "ja": "霊符",
    "en": "Spirit Talisman"
  },
  "job.jiangshi.attack.name": {
    "ja": "跳ね突き",
    "en": "Hopping Strike"
  },
  "job.jiangshi.skill.name": {
    "ja": "跳躍掌",
    "en": "Leaping Palm"
  },
  "job.jiangshi.skill.desc": {
    "ja": "前方72ドット以内の敵1体に攻撃力×2、3秒間回避率＋20%",
    "en": "Strikes one enemy within 72 dots ahead for 2x ATK damage and gains 20% evasion for 3 seconds."
  },
  "job.jiangshi.passive.name": {
    "ja": "貼り直しの霊符",
    "en": "Renewed Talisman"
  },
  "job.jiangshi.passive.desc": {
    "ja": "1戦に1回だけ、倒れる直前にHP30%で復活",
    "en": "Once per battle, revives at 30% max HP when defeated."
  },
  "job.jiangshi.ultimate.name": {
    "ja": "百鬼跳舞",
    "en": "Dance of a Hundred Spirits"
  },
  "job.jiangshi.ultimate.desc": {
    "ja": "敵全体に攻撃力×3.2、自分のHPを25%回復",
    "en": "Deals 3.2x ATK damage to all enemies and restores 25% of own max HP."
  },
  "job.vagabond.name": {
    "ja": "ホームレス",
    "en": "Vagabond"
  },
  "job.vagabond.roleDetail": {
    "ja": "拾い物投げ・戦利品回収",
    "en": "Scavenged projectiles and loot recovery"
  },
  "job.vagabond.weapon": {
    "ja": "拾った道具",
    "en": "Scavenged Tools"
  },
  "job.vagabond.attack.name": {
    "ja": "空き缶投げ",
    "en": "Can Toss"
  },
  "job.vagabond.skill.name": {
    "ja": "拾い物の知恵",
    "en": "Scavenger's Ingenuity"
  },
  "job.vagabond.skill.desc": {
    "ja": "敵全体に攻撃力×1.2、6秒間敵の攻撃力−15%・獲得小判＋15%",
    "en": "Deals 1.2x ATK damage to all enemies. For 6 seconds, reduces enemy ATK by 15% and increases Koban gains by 15%."
  },
  "job.vagabond.passive.name": {
    "ja": "目ざとい回収",
    "en": "Keen-Eyed Scavenger"
  },
  "job.vagabond.passive.desc": {
    "ja": "獲得小判＋10%",
    "en": "Increases Koban gains by 10%."
  },
  "job.vagabond.ultimate.name": {
    "ja": "拾い物大放出",
    "en": "Junk Storm"
  },
  "job.vagabond.ultimate.desc": {
    "ja": "敵全体に攻撃力×2、8秒間敵の攻撃力−25%・獲得小判＋30%",
    "en": "Deals 2x ATK damage to all enemies. For 8 seconds, reduces enemy ATK by 25% and increases Koban gains by 30%."
  },
  "job.rikishi.name": {
    "ja": "力士",
    "en": "Sumo Wrestler"
  },
  "job.rikishi.roleDetail": {
    "ja": "踏ん張り・張り手で押し戻す",
    "en": "Stands firm and pushes enemies back"
  },
  "job.rikishi.weapon": {
    "ja": "張り手",
    "en": "Open-Hand Strike"
  },
  "job.rikishi.attack.name": {
    "ja": "突っ張り",
    "en": "Thrusting Palm"
  },
  "job.rikishi.skill.name": {
    "ja": "張り手",
    "en": "Open-Hand Strike"
  },
  "job.rikishi.skill.desc": {
    "ja": "前方48ドット以内の敵1体に攻撃力×1.8、24ドット押し戻す。4秒間自分の被ダメージ−20%",
    "en": "Hits one enemy within 48 dots ahead for 1.8x ATK damage and pushes it back 24 dots. Reduces own damage taken by 20% for 4 seconds."
  },
  "job.rikishi.passive.name": {
    "ja": "土俵の踏ん張り",
    "en": "Firm Footing"
  },
  "job.rikishi.passive.desc": {
    "ja": "被ダメージ−15%",
    "en": "Reduces damage taken by 15%."
  },
  "job.rikishi.ultimate.name": {
    "ja": "大一番",
    "en": "Grand Bout"
  },
  "job.rikishi.ultimate.desc": {
    "ja": "敵全体に攻撃力×3、32ドット押し戻す。6秒間自分の被ダメージ−30%",
    "en": "Deals 3x ATK damage to all enemies and pushes them back 32 dots. Reduces own damage taken by 30% for 6 seconds."
  },
  "job.sister.name": {
    "ja": "シスター",
    "en": "Sister"
  },
  "job.sister.roleDetail": {
    "ja": "回復・致命傷を一度防ぐ",
    "en": "Healing and protection from fatal damage"
  },
  "job.sister.weapon": {
    "ja": "祈祷書",
    "en": "Prayer Book"
  },
  "job.sister.attack.name": {
    "ja": "光の祈り",
    "en": "Ray of Prayer"
  },
  "job.sister.skill.name": {
    "ja": "祈りの手",
    "en": "Healing Hands"
  },
  "job.sister.skill.desc": {
    "ja": "HP割合が最も低い仲間を攻撃力×2＋最大HPの15%回復",
    "en": "Heals the ally with the lowest HP ratio for 2x ATK + 15% of their max HP."
  },
  "job.sister.passive.name": {
    "ja": "守護の祈り",
    "en": "Prayer of Protection"
  },
  "job.sister.passive.desc": {
    "ja": "戦闘開始時、仲間全員に1戦1回の守護。致命傷をHP1で耐え、1.5秒間無敵",
    "en": "At battle start, grants each ally protection once per battle. Survives a fatal hit at 1 HP and gains 1.5 seconds of invulnerability."
  },
  "job.sister.ultimate.name": {
    "ja": "聖域の祈り",
    "en": "Sanctuary"
  },
  "job.sister.ultimate.desc": {
    "ja": "仲間全員のHPを35%回復し、1.5秒間無敵",
    "en": "Heals all allies for 35% max HP and grants 1.5 seconds of invulnerability."
  },
  "job.tono.name": {
    "ja": "殿",
    "en": "Goofy Lord"
  },
  "job.tono.roleDetail": {
    "ja": "おとぼけ采配・確定強化",
    "en": "Eccentric orders and reliable buffs"
  },
  "job.tono.weapon": {
    "ja": "扇子",
    "en": "Folding Fan"
  },
  "job.tono.attack.name": {
    "ja": "扇子投げ",
    "en": "Fan Toss"
  },
  "job.tono.skill.name": {
    "ja": "あっぱれ采配",
    "en": "Splendid Orders"
  },
  "job.tono.skill.desc": {
    "ja": "6秒間、仲間全員の攻撃力＋15%。必ず成功",
    "en": "Grants all allies 15% ATK for 6 seconds. Always succeeds."
  },
  "job.tono.passive.name": {
    "ja": "殿のお墨付き",
    "en": "Lord's Approval"
  },
  "job.tono.passive.desc": {
    "ja": "戦闘開始時、仲間全員の攻撃間隔−5%",
    "en": "At battle start, reduces all allies' attack intervals by 5%."
  },
  "job.tono.ultimate.name": {
    "ja": "おなーり大号令",
    "en": "Make Way for the Lord"
  },
  "job.tono.ultimate.desc": {
    "ja": "8秒間、仲間全員の攻撃力＋25%・攻撃間隔−20%。費用なし",
    "en": "For 8 seconds, grants all allies 25% ATK and reduces attack intervals by 20%. No cost."
  },
  "job.gariben.name": {
    "ja": "ガリ勉",
    "en": "Bookworm"
  },
  "job.gariben.roleDetail": {
    "ja": "難問出題・弱点分析",
    "en": "Difficult questions and weakness analysis"
  },
  "job.gariben.weapon": {
    "ja": "参考書",
    "en": "Study Guide"
  },
  "job.gariben.attack.name": {
    "ja": "参考書投げ",
    "en": "Book Toss"
  },
  "job.gariben.skill.name": {
    "ja": "難問出題",
    "en": "Difficult Question"
  },
  "job.gariben.skill.desc": {
    "ja": "6秒間、敵全体の攻撃間隔＋25%",
    "en": "Increases all enemies' attack intervals by 25% for 6 seconds."
  },
  "job.gariben.passive.name": {
    "ja": "弱点分析",
    "en": "Weakness Analysis"
  },
  "job.gariben.passive.desc": {
    "ja": "戦闘開始時、その場にいる敵全体の被ダメージ＋8%",
    "en": "At battle start, increases the damage taken by enemies currently present by 8%."
  },
  "job.gariben.ultimate.name": {
    "ja": "徹夜の解答",
    "en": "All-Night Answer"
  },
  "job.gariben.ultimate.desc": {
    "ja": "8秒間、敵全体の攻撃間隔＋40%・仲間全員の会心率＋10%",
    "en": "For 8 seconds, increases all enemies' attack intervals by 40% and grants all allies 10% critical chance."
  },
  "role.tank": {
    "ja": "タンク",
    "en": "Tank"
  },
  "role.attacker": {
    "ja": "アタッカー",
    "en": "Attacker"
  },
  "role.healer": {
    "ja": "ヒーラー",
    "en": "Healer"
  },
  "role.buffer": {
    "ja": "バッファー",
    "en": "Buffer"
  },
  "role.debuffer": {
    "ja": "デバッファー",
    "en": "Debuffer"
  },
  "item.weapon.samurai.0": {
    "ja": "錆び刀",
    "en": "Rusty Katana"
  },
  "item.weapon.samurai.1": {
    "ja": "打刀",
    "en": "Uchigatana"
  },
  "item.weapon.samurai.2": {
    "ja": "名刀・無銘",
    "en": "Nameless Masterwork"
  },
  "item.weapon.ninja.0": {
    "ja": "苦無",
    "en": "Kunai"
  },
  "item.weapon.ninja.1": {
    "ja": "八方手裏剣",
    "en": "Eight-Point Shuriken"
  },
  "item.weapon.ninja.2": {
    "ja": "影縫い",
    "en": "Shadow Pin"
  },
  "item.weapon.jirai.0": {
    "ja": "ハートの手鏡",
    "en": "Heart Mirror"
  },
  "item.weapon.jirai.1": {
    "ja": "量産リボン杖",
    "en": "Ribbon Wand"
  },
  "item.weapon.jirai.2": {
    "ja": "激重ハサミ",
    "en": "Heavy Scissors"
  },
  "item.weapon.otaku.0": {
    "ja": "ペンライト",
    "en": "Glow Stick"
  },
  "item.weapon.otaku.1": {
    "ja": "推し色サイリウム",
    "en": "Favorite-Color Light Stick"
  },
  "item.weapon.otaku.2": {
    "ja": "痛うちわ",
    "en": "Fan-Art Paddle"
  },
  "item.weapon.pachipro.0": {
    "ja": "玉の箱",
    "en": "Ball Box"
  },
  "item.weapon.pachipro.1": {
    "ja": "千発箱",
    "en": "Thousand-Ball Box"
  },
  "item.weapon.pachipro.2": {
    "ja": "黄金のドル箱",
    "en": "Golden Ball Box"
  },
  "item.weapon.miko.0": {
    "ja": "紙の御幣",
    "en": "Paper Ritual Wand"
  },
  "item.weapon.miko.1": {
    "ja": "白木の御幣",
    "en": "Whitewood Ritual Wand"
  },
  "item.weapon.miko.2": {
    "ja": "神楽の御幣",
    "en": "Kagura Ritual Wand"
  },
  "item.weapon.bancho.0": {
    "ja": "拳帯",
    "en": "Fist Wraps"
  },
  "item.weapon.bancho.1": {
    "ja": "鉄拳グローブ",
    "en": "Iron-Fist Gloves"
  },
  "item.weapon.bancho.2": {
    "ja": "総長の拳",
    "en": "Boss's Fist"
  },
  "item.weapon.gyaru.0": {
    "ja": "デコスマホ",
    "en": "Decorated Phone"
  },
  "item.weapon.gyaru.1": {
    "ja": "盛りスマホ",
    "en": "Glam Phone"
  },
  "item.weapon.gyaru.2": {
    "ja": "伝説のデコスマホ",
    "en": "Legendary Decorated Phone"
  },
  "item.weapon.sukeban.0": {
    "ja": "木刀",
    "en": "Wooden Sword"
  },
  "item.weapon.sukeban.1": {
    "ja": "樫の木刀",
    "en": "Oak Sword"
  },
  "item.weapon.sukeban.2": {
    "ja": "夜露死苦木刀",
    "en": "Night Riders' Wooden Sword"
  },
  "item.weapon.farmer.0": {
    "ja": "竹槍",
    "en": "Bamboo Spear"
  },
  "item.weapon.farmer.1": {
    "ja": "節竹の槍",
    "en": "Knotted Bamboo Spear"
  },
  "item.weapon.farmer.2": {
    "ja": "豊穣の竹槍",
    "en": "Harvest Bamboo Spear"
  },
  "item.weapon.maid.0": {
    "ja": "仕込みナイフ",
    "en": "Concealed Knives"
  },
  "item.weapon.maid.1": {
    "ja": "銀の投げナイフ",
    "en": "Silver Throwing Knives"
  },
  "item.weapon.maid.2": {
    "ja": "三日月ナイフ",
    "en": "Crescent Knives"
  },
  "item.weapon.jiangshi.0": {
    "ja": "紙の霊符",
    "en": "Paper Spirit Talisman"
  },
  "item.weapon.jiangshi.1": {
    "ja": "朱印の霊符",
    "en": "Crimson Spirit Talisman"
  },
  "item.weapon.jiangshi.2": {
    "ja": "鎮魂の霊符",
    "en": "Requiem Talisman"
  },
  "item.weapon.vagabond.0": {
    "ja": "拾った空き缶",
    "en": "Scavenged Can"
  },
  "item.weapon.vagabond.1": {
    "ja": "道具の寄せ集め",
    "en": "Assorted Tools"
  },
  "item.weapon.vagabond.2": {
    "ja": "掘り出し物の道具箱",
    "en": "Salvaged Toolbox"
  },
  "item.weapon.rikishi.0": {
    "ja": "稽古の手甲",
    "en": "Training Bracers"
  },
  "item.weapon.rikishi.1": {
    "ja": "土俵の手甲",
    "en": "Ring Bracers"
  },
  "item.weapon.rikishi.2": {
    "ja": "横綱の手甲",
    "en": "Grand Champion's Bracers"
  },
  "item.weapon.sister.0": {
    "ja": "祈祷書",
    "en": "Prayer Book"
  },
  "item.weapon.sister.1": {
    "ja": "銀装の祈祷書",
    "en": "Silver-Bound Prayer Book"
  },
  "item.weapon.sister.2": {
    "ja": "祝福の祈祷書",
    "en": "Blessed Prayer Book"
  },
  "item.weapon.tono.0": {
    "ja": "紙の扇子",
    "en": "Paper Fan"
  },
  "item.weapon.tono.1": {
    "ja": "金縁の扇子",
    "en": "Gold-Trimmed Fan"
  },
  "item.weapon.tono.2": {
    "ja": "あっぱれの扇子",
    "en": "Splendid Fan"
  },
  "item.weapon.gariben.0": {
    "ja": "古い参考書",
    "en": "Old Study Guide"
  },
  "item.weapon.gariben.1": {
    "ja": "書き込み参考書",
    "en": "Annotated Study Guide"
  },
  "item.weapon.gariben.2": {
    "ja": "秘伝の問題集",
    "en": "Secret Problem Collection"
  },
  "item.armor.0": {
    "ja": "着流し",
    "en": "Casual Robe"
  },
  "item.armor.1": {
    "ja": "鎖帷子",
    "en": "Chainmail"
  },
  "item.armor.2": {
    "ja": "陣羽織",
    "en": "Campaign Coat"
  },
  "item.charm.0": {
    "ja": "交通安全守",
    "en": "Safe Travels Charm"
  },
  "item.charm.1": {
    "ja": "学業成就守",
    "en": "Scholarship Charm"
  },
  "item.charm.2": {
    "ja": "金運招福守",
    "en": "Good Fortune Charm"
  },
  "slot.weapon": {
    "ja": "武器",
    "en": "Weapon"
  },
  "slot.armor": {
    "ja": "防具",
    "en": "Armor"
  },
  "slot.charm": {
    "ja": "お守り",
    "en": "Charm"
  },
  "rarity.0": {
    "ja": "並",
    "en": "Common"
  },
  "rarity.1": {
    "ja": "上",
    "en": "Uncommon"
  },
  "rarity.2": {
    "ja": "特上",
    "en": "Rare"
  },
  "rarity.3": {
    "ja": "極",
    "en": "Epic"
  },
  "rarity.4": {
    "ja": "伝説",
    "en": "Legendary"
  },
  "rarity.5": {
    "ja": "神話",
    "en": "Mythic"
  },
  "affix.atkPct": {
    "ja": "攻撃",
    "en": "ATK"
  },
  "affix.hpPct": {
    "ja": "最大HP",
    "en": "Max HP"
  },
  "affix.defPct": {
    "ja": "防御",
    "en": "DEF"
  },
  "affix.intervalPct": {
    "ja": "攻撃間隔",
    "en": "Attack Interval"
  },
  "affix.cri": {
    "ja": "会心率",
    "en": "Critical Chance"
  },
  "affix.criMul": {
    "ja": "会心倍率",
    "en": "Critical Damage"
  },
  "affix.eva": {
    "ja": "回避",
    "en": "Evasion"
  },
  "affix.luk": {
    "ja": "運",
    "en": "Luck"
  },
  "affix.kobanPct": {
    "ja": "獲得小判",
    "en": "Koban Gain"
  },
  "affix.cooldownPct": {
    "ja": "スキル再使用",
    "en": "Skill Cooldown"
  },
  "affix.dmgTakenPct": {
    "ja": "被ダメージ",
    "en": "Damage Taken"
  },
  "affix.dropPct": {
    "ja": "ドロップ率",
    "en": "Drop Rate"
  },
  "attribute.str": {
    "ja": "筋力",
    "en": "Strength"
  },
  "attribute.dex": {
    "ja": "敏捷",
    "en": "Dexterity"
  },
  "attribute.vit": {
    "ja": "体力",
    "en": "Vitality"
  },
  "attribute.int": {
    "ja": "知力",
    "en": "Intelligence"
  },
  "item.unique.titan.name": {
    "ja": "巨神の断ち刃",
    "en": "Titan's Cleaver"
  },
  "item.unique.titan.build": {
    "ja": "筋力極振り：強烈な一撃。攻撃間隔が長くなる",
    "en": "STR-focused: Devastating hits, but slower attacks."
  },
  "item.unique.gale.name": {
    "ja": "疾風の牙",
    "en": "Gale Fang"
  },
  "item.unique.gale.build": {
    "ja": "敏捷極振り：高速会心。単発威力は重量武器に劣る",
    "en": "DEX-focused: Fast critical hits, with less damage per hit than heavy weapons."
  },
  "item.unique.oracle.name": {
    "ja": "星詠みの聖具",
    "en": "Starreader's Relic"
  },
  "item.unique.oracle.build": {
    "ja": "知力極振り：スキルと回復を高速回転。通常攻撃は遅い",
    "en": "INT-focused: Rapid skills and healing, but slower normal attacks."
  },
  "item.unique.bastion.name": {
    "ja": "不沈の鎧",
    "en": "Bastion Armor"
  },
  "item.unique.bastion.build": {
    "ja": "体力極振り：圧倒的な耐久。攻撃力と手数を犠牲にする",
    "en": "VIT-focused: Exceptional durability at the cost of damage and attack speed."
  },
  "enemy.chochin.name": {
    "ja": "提灯お化け",
    "en": "Paper Lantern Ghost"
  },
  "enemy.chochin.desc": {
    "ja": "夜道をふらふら漂う古提灯。",
    "en": "An old lantern drifting along the dark road."
  },
  "enemy.kappa.name": {
    "ja": "河童",
    "en": "Kappa"
  },
  "enemy.kappa.desc": {
    "ja": "甲羅が硬く、会心が通りにくい。",
    "en": "Its hard shell reduces the bonus damage of critical hits."
  },
  "enemy.onibi.name": {
    "ja": "鬼火",
    "en": "Ghost Flame"
  },
  "enemy.onibi.desc": {
    "ja": "離れたところから火の玉を飛ばす。",
    "en": "Fires balls of flame from a distance."
  },
  "enemy.ooni.name": {
    "ja": "大鬼",
    "en": "Great Oni"
  },
  "enemy.ooni.desc": {
    "ja": "地下墓地の主。溜めて前の二人を金棒で殴る。防御・弱体で耐え、力士の押し戻しで溜めを中断できる。",
    "en": "Master of the catacombs. Winds up a club strike against the front two allies. Defense and debuffs help you endure it; the Sumo Wrestler can interrupt the windup by pushing it back."
  },
  "enemy.ooni.skill": {
    "ja": "金棒振り",
    "en": "Club Swing"
  },
  "enemy.karakasa.name": {
    "ja": "唐傘おばけ",
    "en": "Umbrella Ghost"
  },
  "enemy.karakasa.desc": {
    "ja": "ひらひらとよける一本足の傘。",
    "en": "A one-legged umbrella that nimbly dodges attacks."
  },
  "enemy.bakeneko.name": {
    "ja": "化け猫",
    "en": "Monster Cat"
  },
  "enemy.bakeneko.desc": {
    "ja": "素早い爪で二回ひっかく。",
    "en": "Scratches twice with swift claws."
  },
  "enemy.manekimodoki.name": {
    "ja": "招き猫もどき",
    "en": "Lucky Cat Mimic"
  },
  "enemy.manekimodoki.desc": {
    "ja": "倒すと小判がざくざく出る。",
    "en": "Drops a generous pile of Koban when defeated."
  },
  "enemy.manekitaisho.name": {
    "ja": "招き猫大将",
    "en": "Lucky Cat General"
  },
  "enemy.manekitaisho.desc": {
    "ja": "朽ちた商街の主。構えてから手下を呼ぶ。力士の押し戻しで召喚を止めるか、範囲攻撃で手下を一掃する。",
    "en": "Master of the ruined market. Prepares to summon lesser cats. Interrupt the summon with the Sumo Wrestler's push, or clear its followers with area attacks."
  },
  "enemy.manekitaisho.skill": {
    "ja": "千客万来",
    "en": "Crowd of Customers"
  },
  "enemy.bugsei.name": {
    "ja": "バグ精霊",
    "en": "Bug Sprite"
  },
  "enemy.bugsei.desc": {
    "ja": "倒すと小さく分裂する。",
    "en": "Splits into smaller fragments when defeated."
  },
  "enemy.bugsei_child.name": {
    "ja": "バグ精霊（小）",
    "en": "Bug Sprite Fragment"
  },
  "enemy.bugsei_child.desc": {
    "ja": "分裂した欠片。",
    "en": "A small fragment left by a split."
  },
  "enemy.noroifig.name": {
    "ja": "呪いのフィギュア",
    "en": "Cursed Figurine"
  },
  "enemy.noroifig.desc": {
    "ja": "その場から動かず、後ろの仲間を狙い撃つ。",
    "en": "Stays in place and targets allies at the back."
  },
  "enemy.popuponi.name": {
    "ja": "ポップアップ鬼",
    "en": "Pop-up Oni"
  },
  "enemy.popuponi.desc": {
    "ja": "先頭に飛びついて自爆する。近づく前に倒したい。",
    "en": "Leaps at the front line and explodes. Defeat it before it reaches you."
  },
  "enemy.denno_kyubi.name": {
    "ja": "電脳九尾",
    "en": "Cyber Nine-Tails"
  },
  "enemy.denno_kyubi.desc": {
    "ja": "禁術の書庫の主。三人を狙う狐火と、HP半分で生む幻影。結界・回復で支え、幻影は範囲攻撃で倒す。",
    "en": "Master of the forbidden archive. Targets three allies with foxfire and creates phantoms at half HP. Use wards and healing to survive, and area attacks to clear the phantoms."
  },
  "enemy.denno_kyubi.skill": {
    "ja": "狐火",
    "en": "Foxfire"
  },
  "enemy.kyubi_phantom.name": {
    "ja": "九尾の幻影",
    "en": "Nine-Tails Phantom"
  },
  "enemy.kyubi_phantom.desc": {
    "ja": "本体の影。",
    "en": "A shadow of the original."
  },
  "dojo.atk.name": {
    "ja": "素振り",
    "en": "Practice Swings"
  },
  "dojo.atk.desc": {
    "ja": "全員の攻撃力 +3%",
    "en": "All allies ATK +3%"
  },
  "dojo.hp.name": {
    "ja": "走り込み",
    "en": "Endurance Training"
  },
  "dojo.hp.desc": {
    "ja": "全員の最大HP +4%",
    "en": "All allies max HP +4%"
  },
  "dojo.walk.name": {
    "ja": "早足",
    "en": "Quick Steps"
  },
  "dojo.walk.desc": {
    "ja": "移動の速さ +5%",
    "en": "Travel speed +5%"
  },
  "dojo.drop.name": {
    "ja": "目利き",
    "en": "Appraisal"
  },
  "dojo.drop.desc": {
    "ja": "装備のドロップ率 +2%（割合）",
    "en": "Equipment drop rate +2% (relative)"
  },
  "dojo.offline.name": {
    "ja": "夜回りの約束",
    "en": "Night Watch Promise"
  },
  "dojo.offline.desc": {
    "ja": "オフライン報酬の上限 +1時間",
    "en": "Offline reward time limit +1 hour"
  },
  "dungeon.yomi.name": {
    "ja": "黄泉の迷宮",
    "en": "Labyrinth of Yomi"
  },
  "dungeon.yomi.biome.0": {
    "ja": "古の地下墓地",
    "en": "Ancient Catacombs"
  },
  "dungeon.yomi.biome.1": {
    "ja": "朽ちた商街",
    "en": "Forsaken Market"
  },
  "dungeon.yomi.biome.2": {
    "ja": "禁術の書庫",
    "en": "Forbidden Archive"
  },
  "difficulty.0": {
    "ja": "通常",
    "en": "Normal"
  },
  "difficulty.1": {
    "ja": "修羅",
    "en": "Nightmare"
  },
  "difficulty.2": {
    "ja": "深淵",
    "en": "Abyss"
  },
  "area.1": {
    "ja": "夜の街道",
    "en": "Night Road"
  },
  "area.2": {
    "ja": "シャッター商店街",
    "en": "Shuttered Shopping District"
  },
  "area.3": {
    "ja": "電脳街",
    "en": "Cyber District"
  },
  "message.kind.skill": {
    "ja": "スキル",
    "en": "Skill"
  },
  "message.kind.passive": {
    "ja": "パッシブ",
    "en": "Passive"
  },
  "message.kind.ultimate": {
    "ja": "奥義",
    "en": "Ultimate"
  },
  "message.range.melee": {
    "ja": "近接",
    "en": "Melee"
  },
  "message.range.ranged": {
    "ja": "遠隔",
    "en": "Ranged"
  },
  "message.none": {
    "ja": "なし",
    "en": "None"
  },
  "message.item.heavy": {
    "ja": "重装：筋力主ジョブ専用",
    "en": "Heavy armor: STR-primary jobs only"
  },
  "message.item.robe": {
    "ja": "法衣：知力主ジョブ専用",
    "en": "Robes: INT-primary jobs only"
  },
  "message.error.lockedFloor": {
    "ja": "まだ解放されていない階層・難易度です",
    "en": "This floor or difficulty has not been unlocked."
  },
  "message.error.formation": {
    "ja": "隊列が正しくありません",
    "en": "The party order is invalid."
  },
  "message.error.upgrade": {
    "ja": "不明な強化です",
    "en": "Unknown upgrade."
  },
  "message.error.noOffline": {
    "ja": "受け取れる報酬はありません",
    "en": "No rewards are available to claim."
  },
  "message.error.missingItem": {
    "ja": "持っていない装備です",
    "en": "This equipment is not in your inventory."
  },
  "message.error.allocation": {
    "ja": "振り分ける能力・ポイントが正しくありません",
    "en": "The selected attribute or point amount is invalid."
  },
  "message.error.job": {
    "ja": "不明なジョブです",
    "en": "Unknown job."
  },
  "message.error.class": {
    "ja": "このジョブでは扱えない種類の装備です",
    "en": "This job cannot use this equipment class."
  },
  "message.error.slot": {
    "ja": "装備する場所が違います",
    "en": "This equipment belongs in a different slot."
  },
  "message.error.missingItems": {
    "ja": "持っていない装備が含まれています",
    "en": "Some selected equipment is not in your inventory."
  },
  "message.error.lockedItems": {
    "ja": "ロック中の装備は売れません",
    "en": "Locked equipment cannot be sold."
  },
  "message.error.equippedItems": {
    "ja": "装備中のものは売れません",
    "en": "Equipped items cannot be sold."
  },
  "message.error.upgradeMax": {
    "ja": "これ以上は強化できません",
    "en": "This upgrade is already at its limit."
  },
  "message.error.noKoban": {
    "ja": "小判が足りません",
    "en": "Not enough Koban."
  },
  "message.state.town": {
    "ja": "街",
    "en": "Town"
  },
  "message.state.returnTown": {
    "ja": "街へ帰還しました",
    "en": "Returned to town."
  },
  "message.state.walk": {
    "ja": "探索中",
    "en": "Exploring"
  },
  "message.state.battle": {
    "ja": "戦闘中",
    "en": "In battle"
  },
  "message.state.ready": {
    "ja": "準備OK",
    "en": "Ready"
  },
  "message.state.defeated": {
    "ja": "戦闘不能",
    "en": "Defeated"
  },
  "message.log.boss": {
    "ja": "ボス出現！",
    "en": "Boss approaching!"
  },
  "message.log.wipe": {
    "ja": "全滅… ウェーブ1から",
    "en": "Party wiped out... Restarting from wave 1."
  },
  "message.log.treasure": {
    "ja": "宝箱を発見！",
    "en": "Treasure chest found!"
  },
  "message.log.altar": {
    "ja": "祭壇の祝福",
    "en": "Altar blessing"
  },
  "message.log.kakuhen": {
    "ja": "確変突入！",
    "en": "Jackpot mode!"
  },
  "message.log.miss": {
    "ja": "ハズレ",
    "en": "No luck"
  },
  "message.log.phantom": {
    "ja": "幻影分身",
    "en": "Phantom Split"
  },
  "message.log.passion": {
    "ja": "情念",
    "en": "Passion"
  },
  "message.floor.normal": {
    "ja": "通常階",
    "en": "Standard Floor"
  },
  "message.floor.treasure": {
    "ja": "宝箱",
    "en": "Treasure Chest"
  },
  "message.floor.altar": {
    "ja": "祭壇",
    "en": "Altar"
  },
  "message.stat.damage": {
    "ja": "与ダメージ",
    "en": "Damage Dealt"
  },
  "message.stat.healing": {
    "ja": "回復量",
    "en": "Healing Done"
  },
  "message.currency": {
    "ja": "小判",
    "en": "Koban"
  },
  "message.codex.title": {
    "ja": "妖怪図鑑",
    "en": "Yokai Codex"
  },
  "message.codex.undiscovered": {
    "ja": "未発見",
    "en": "Undiscovered"
  },
  "message.codex.boss": {
    "ja": "10階ごとの大ボス。弱ると攻撃が速くなる。",
    "en": "A major boss encountered every 10 floors. Attacks faster when weakened."
  },
  "message.codex.unseenBoss": {
    "ja": "この区域の主。出会って特徴を確かめよう。",
    "en": "The master of this region. Encounter it to learn its traits."
  },
  "message.codex.unseen": {
    "ja": "探索を進めると発見できる。",
    "en": "Explore further to discover this enemy."
  },
  "message.guide.unknown": {
    "ja": "不明",
    "en": "Unknown"
  },
  "message.tier.2": {
    "ja": "弐",
    "en": "II"
  },
  "message.tier.3": {
    "ja": "参",
    "en": "III"
  },
  "message.tier.4": {
    "ja": "肆",
    "en": "IV"
  },
  "message.tier.5": {
    "ja": "伍",
    "en": "V"
  },
  "message.tier.6": {
    "ja": "陸",
    "en": "VI"
  },
  "message.tier.7": {
    "ja": "漆",
    "en": "VII"
  },
  "message.tier.8": {
    "ja": "捌",
    "en": "VIII"
  },
  "message.tier.9": {
    "ja": "玖",
    "en": "IX"
  },
  "message.tooltip.ult": {
    "ja": "奥義はLv10で解放",
    "en": "Ultimate unlocks at Lv 10"
  },
  "message.tooltip.grow": {
    "ja": "クリックで育成画面",
    "en": "Click to open training"
  },
  "message.tooltip.floor": {
    "ja": "クリックでステージ画面",
    "en": "Click to open floors"
  },
  "message.tooltip.boss": {
    "ja": "（ボス）",
    "en": "(Boss)"
  },
  "message.tooltip.loop": {
    "ja": "周回中",
    "en": "Farming"
  },
  "guide.chochin.role": {
    "ja": "近接",
    "en": "Melee"
  },
  "guide.chochin.tactic": {
    "ja": "近づいて攻撃する。前列で受け止め、後ろから攻めよう。",
    "en": "Approaches to attack. Hold the front line and strike from behind."
  },
  "guide.kappa.role": {
    "ja": "装甲",
    "en": "Armored"
  },
  "guide.kappa.tactic": {
    "ja": "硬い甲羅は会心にも強い。攻撃力を上げて押し切ろう。",
    "en": "Its hard shell also resists critical damage. Raise ATK to break through."
  },
  "guide.onibi.role": {
    "ja": "遠距離",
    "en": "Ranged"
  },
  "guide.onibi.tactic": {
    "ja": "離れた位置から弾を放つ。前列の耐久と素早い攻撃で対抗しよう。",
    "en": "Fires projectiles from a distance. Counter with frontline durability and fast attacks."
  },
  "guide.ooni.role": {
    "ja": "ボス・前列強打",
    "en": "Boss: Frontline Slam"
  },
  "guide.ooni.tactic": {
    "ja": "金棒は前の二人を巻き込む。前列の防御と回復を整えよう。",
    "en": "The club hits the front two allies. Prepare frontline defense and healing."
  },
  "guide.karakasa.role": {
    "ja": "回避",
    "en": "Evasion"
  },
  "guide.karakasa.tactic": {
    "ja": "攻撃をよくかわす。手数を増やし、回復しながら戦おう。",
    "en": "Dodges attacks frequently. Increase your attack frequency and keep healing."
  },
  "guide.bakeneko.role": {
    "ja": "速攻・連撃",
    "en": "Fast Multi-Hit Attacker"
  },
  "guide.bakeneko.tactic": {
    "ja": "一度に二回ひっかく。前列の防御と被ダメージ軽減が役に立つ。",
    "en": "Scratches twice per attack. Frontline defense and damage reduction are effective."
  },
  "guide.manekimodoki.role": {
    "ja": "小判持ち",
    "en": "Koban Carrier"
  },
  "guide.manekimodoki.tactic": {
    "ja": "攻撃は控えめだが小判を多く持つ。周回中の稼ぎどころ。",
    "en": "Has modest attacks but carries extra Koban. A useful target while farming."
  },
  "guide.manekitaisho.role": {
    "ja": "ボス・召喚",
    "en": "Boss: Summoner"
  },
  "guide.manekitaisho.tactic": {
    "ja": "手下を呼び出す。範囲攻撃で取り巻きごと倒そう。",
    "en": "Summons helpers. Use area damage to defeat the boss and its minions together."
  },
  "guide.bugsei.role": {
    "ja": "分裂・遠距離",
    "en": "Splitting Ranged Attacker"
  },
  "guide.bugsei.tactic": {
    "ja": "倒すと二つに分裂する。小さな欠片も倒すまで油断しない。",
    "en": "Splits in two when defeated. Stay alert until the fragments are defeated as well."
  },
  "guide.bugsei_child.role": {
    "ja": "遠距離",
    "en": "Ranged"
  },
  "guide.bugsei_child.tactic": {
    "ja": "離れた位置から弾を放つ。前列の耐久と素早い攻撃で対抗しよう。",
    "en": "Fires projectiles from a distance. Counter with frontline durability and fast attacks."
  },
  "guide.noroifig.role": {
    "ja": "後衛狙い",
    "en": "Backline Hunter"
  },
  "guide.noroifig.tactic": {
    "ja": "後ろの仲間へ攻撃する。回復役の体力や防御も確保しよう。",
    "en": "Attacks allies at the back. Give your healers enough HP and defense."
  },
  "guide.popuponi.role": {
    "ja": "突進・自爆",
    "en": "Charging Bomber"
  },
  "guide.popuponi.tactic": {
    "ja": "接近すると前列を巻き込んで自爆。遠距離攻撃で近づく前に倒そう。",
    "en": "Explodes near the front line. Use ranged attacks to defeat it before it reaches you."
  },
  "guide.denno_kyubi.role": {
    "ja": "ボス・幻影",
    "en": "Boss: Phantoms"
  },
  "guide.denno_kyubi.tactic": {
    "ja": "体力半分で幻影が出現。全体攻撃とパーティの回復を用意しよう。",
    "en": "Creates phantoms at half HP. Prepare attacks that hit all enemies and party healing."
  },
  "guide.kyubi_phantom.role": {
    "ja": "近接",
    "en": "Melee"
  },
  "guide.kyubi_phantom.tactic": {
    "ja": "近づいて攻撃する。前列で受け止め、後ろから攻めよう。",
    "en": "Approaches to attack. Hold the front line and strike from behind."
  }
}

export const gameEnglish: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(Object.values(gameTranslations).map(({ ja, en }) => [ja, en])))

/** Only complete phrases and anchored, explicit templates are translated. Save IDs and unknown text pass through. */
export const gameTranslationTemplates: ReadonlyArray<{ ja: string; en: string }> = [
  { ja: '{description}（{seconds}秒ごと）', en: '{description} (every {seconds}s)' },
  { ja: '{attribute}{required}必要（現在{current}）', en: 'Requires {attribute} {required} (current {current})' },
  { ja: '基礎性能{percent}%（85〜115%）', en: 'Base roll {percent}% (85-115%)' },
  { ja: '必要能力：{requirements}', en: 'Requirements: {requirements}' },
  { ja: '{name}・改{tier}', en: '{name} Mk {tier}' },
  { ja: '{job}専用', en: '{job} only' },
  { ja: '攻撃力×{value}', en: 'ATK x{value}' },
  { ja: '売れる{rarity}以下の装備はありません', en: 'No unequipped items of {rarity} rarity or lower can be sold.' },
  { ja: '{floor} 踏破！', en: '{floor} cleared!' },
  { ja: '地下 {depth} 階', en: 'Basement {depth}' },
  { ja: '{rarity}の装備！ {name}', en: '{rarity} equipment! {name}' },
  { ja: '発見 {seen} / {total}種。姿と特徴を知り、次の編成に生かそう。', en: 'Discovered {seen} / {total}. Learn their traits to plan your next party.' },
  { ja: '{stat}（{points}ポイント）', en: '{stat} ({points} points)' },
  { ja: '筋力{value}', en: 'STR {value}' },
  { ja: '敏捷{value}', en: 'DEX {value}' },
  { ja: '体力{value}', en: 'VIT {value}' },
  { ja: '知力{value}', en: 'INT {value}' },
  ...['攻撃', '最大HP', '防御', '攻撃間隔', '会心率', '会心倍率', '回避', '運', '獲得小判', 'スキル再使用', '被ダメージ', 'ドロップ率'].map(stat => ({ ja: stat + ' {value}', en: (gameEnglish[stat] ?? stat) + ' {value}' })),
]

const compiledTemplates = gameTranslationTemplates.map(template => {
  const keys: string[] = []
  const pattern = template.ja.split(/(\{\w+\})/g).map(part => {
    if (/^\{\w+\}$/.test(part)) {
      const key = part.slice(1, -1); keys.push(key)
      return ['value', 'seconds', 'percent', 'points', 'current', 'required', 'seen', 'total', 'depth'].includes(key) ? '([+−-]?\\d+(?:[.,]\\d+)*(?:%)?)' : '(.+?)'
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }).join('')
  return { ...template, keys, pattern: new RegExp('^' + pattern + '$') }
})

export function translateGameText(source: string): string {
  const translate = (text: string, depth: number): string => {
    if (Object.hasOwn(gameEnglish, text)) return gameEnglish[text]
    if (depth > 8) return text
    // These two lists are structured equipment text, never arbitrary substring replacement.
    if (/^(?:筋力|敏捷|体力|知力)\d+(?: \/ (?:筋力|敏捷|体力|知力)\d+)+$/.test(text)) return text.split(' / ').map(part => translate(part, depth + 1)).join(' / ')
    if (text.includes('、') && text.split('、').every(part => /^(?:筋力|敏捷|体力|知力)\d+必要（現在\d+）$/.test(part))) return text.split('、').map(part => translate(part, depth + 1)).join(', ')
    for (const template of compiledTemplates) {
      const match = template.pattern.exec(text)
      if (!match) continue
      return template.en.replace(/\{(\w+)\}/g, (token, key: string) => {
        const index = template.keys.indexOf(key)
        return index < 0 ? token : translate(match[index + 1], depth + 1)
      })
    }
    return text
  }
  return translate(source, 0)
}
