import type { JobId } from '../sim/types.ts'

/** Shared naming and translation source for newly rolled equipment. Existing save names are retained. */
export const equipmentNameRanks = [1, 6, 16, 31, 61, 101, 141, 181] as const
export const equipmentMarkStart = 201
export const equipmentMarkSpan = 25
export type ArmorClass = 'heavy' | 'light' | 'robe'
type NamePair = readonly [ja: string, en: string]
export const weaponNamePairs: Record<JobId, readonly NamePair[]> = {
  samurai: [["錆び刀","Rusty Katana"],["打刀","Katana"],["名刀・無銘","Nameless Blade"],["鬼切の太刀","Oni-Cleaving Tachi"],["月影の野太刀","Moonshadow Nodachi"],["修羅の陣太刀","Shura Warblade"],["黄泉渡りの刀","Yomi Crossing Blade"],["暁の一文字","Dawn Ichimonji"]],
  ninja: [["苦無","Kunai"],["八方手裏剣","Eight-Point Shuriken"],["影縫い","Shadow Pin"],["霞隠れの忍具","Mistveil Ninja Tools"],["黒羽の風魔手裏剣","Blackwing Fuma Shuriken"],["夜叉の飛苦無","Yasha Throwing Kunai"],["朧月の暗器","Hazy Moon Hidden Blades"],["無影の忍具","Shadowless Ninja Tools"]],
  jirai: [["ハートの手鏡","Heart Hand Mirror"],["量産リボン杖","Ribbon Wand"],["激重ハサミ","Heavyhearted Scissors"],["涙石のロケット","Teardrop Locket"],["真夜中の呪い鏡","Midnight Curse Mirror"],["血染めリボンの杖","Blood-Ribbon Wand"],["永遠の約束錠","Eternal Promise Lock"],["終幕の黒薔薇","Finale Black Rose"]],
  otaku: [["ペンライト","Penlight"],["推し色サイリウム","Favorite-Color Glowstick"],["痛うちわ","Fan Merch Uchiwa"],["最前列の応援旗","Front-Row Cheer Flag"],["銀河色ペンライト","Galaxy Penlight"],["伝説公演のサイリウム","Legendary Show Glowstick"],["千客万来の大団扇","Thousand-Fan Uchiwa"],["終わらないアンコール","Endless Encore"]],
  pachipro: [["玉の箱","Ball Box"],["千発箱","Thousand-Ball Box"],["黄金のドル箱","Golden Jackpot Box"],["連勝の玉袋","Winning-Streak Pouch"],["七福の千両箱","Seven-Fortune Chest"],["逆転の大当り玉","Comeback Jackpot Ball"],["万枚の宝箱","Ten-Thousand Coin Chest"],["天運の打ち出し玉","Heavenly Fortune Ball"]],
  miko: [["紙の御幣","Paper Gohei"],["白木の御幣","Plainwood Gohei"],["神楽の御幣","Kagura Gohei"],["鈴鳴りの祓串","Chiming Purification Wand"],["月白の神楽鈴","Moonwhite Kagura Bells"],["黄泉清めの御幣","Yomi-Cleansing Gohei"],["星祭りの祓串","Star Festival Wand"],["天照の神楽鈴","Sunlit Kagura Bells"]],
  bancho: [["拳帯","Fist Wraps"],["鉄拳グローブ","Iron-Fist Gloves"],["総長の拳","Boss Fist"],["校門破りの鉄拳","Gate-Breaker Knuckles"],["義理堅い拳帯","Loyalty Fist Wraps"],["百戦の喧嘩拳","Hundred-Brawl Knuckles"],["仁義の鉄手甲","Honorbound Gauntlets"],["天下無双の拳","Peerless Fists"]],
  gyaru: [["デコスマホ","Decorated Phone"],["盛りスマホ","Glam Phone"],["伝説のデコスマホ","Legendary Glam Phone"],["星盛りの自撮り棒","Star-Studded Selfie Stick"],["虹色ライブ端末","Rainbow Stream Phone"],["百鬼映えカメラ","Yokai Glam Camera"],["夜明けの配信端末","Daybreak Stream Phone"],["世界を沸かすデコスマホ","World-Hype Glam Phone"]],
  sukeban: [["木刀","Wooden Sword"],["樫の木刀","Oak Sword"],["夜露死苦木刀","Yoroshiku Sword"],["鎖巻きの木刀","Chain-Wrapped Sword"],["紅蓮の鉄扇","Crimson Iron Fan"],["夜叉姫の長ドス","Yasha Princess Long Blade"],["不退転の鉄木刀","Unyielding Ironwood Sword"],["一騎当千の得物","One-Against-Thousands Blade"]],
  farmer: [["竹槍","Bamboo Spear"],["節竹の槍","Knotted Bamboo Spear"],["豊穣の竹槍","Harvest Bamboo Spear"],["補強だらけの竹槍","Much-Mended Bamboo Spear"],["村守りの長竹槍","Village Guard Bamboo Spear"],["一揆衆の旗槍","Uprising Banner Spear"],["五穀の祈り槍","Five-Grain Prayer Spear"],["天下に届く竹槍","Sky-Reaching Bamboo Spear"]],
  maid: [["仕込みナイフ","Hidden Knife"],["銀の投げナイフ","Silver Throwing Knife"],["三日月ナイフ","Crescent Knife"],["給仕長の銀刃","Head Maid Silver Blade"],["薔薇彫りの投げナイフ","Rose-Engraved Throwing Knife"],["宵闇の仕込み刃","Twilight Hidden Blade"],["星屑の銀ナイフ","Stardust Silver Knife"],["お帰りなさいの切り札","Welcome-Home Trump Card"]],
  jiangshi: [["紙の霊符","Paper Spirit Talisman"],["朱印の霊符","Vermilion Spirit Talisman"],["鎮魂の霊符","Soul-Calming Talisman"],["月光の封呪符","Moonlight Sealing Talisman"],["冥界渡りの霊符","Underworld Passage Talisman"],["七星の鎮魂符","Seven-Star Soul Talisman"],["不滅の封霊符","Undying Spirit Seal"],["輪廻の黄符","Rebirth Yellow Talisman"]],
  vagabond: [["拾った空き缶","Found Empty Can"],["道具の寄せ集め","Assorted Tools"],["掘り出し物の道具箱","Salvaged Toolbox"],["針金巻きの拾い物","Wire-Bound Salvage"],["路地裏の掘り出し物","Back-Alley Treasure"],["百戦のガラクタ箱","Battleworn Junk Box"],["黄泉でも拾った道具","Tools Found Even in Yomi"],["爺さん秘蔵の宝箱","Old Man Secret Treasure Box"]],
  rikishi: [["稽古の手甲","Training Gauntlets"],["土俵の手甲","Dohyo Gauntlets"],["横綱の手甲","Yokozuna Gauntlets"],["鉄壁の張り手帯","Ironwall Palm Wraps"],["雷鳴の力士手甲","Thunder Sumo Gauntlets"],["鬼退治の手甲","Oni-Banishing Gauntlets"],["不動の大関手甲","Immovable Ozeki Gauntlets"],["天下一の綱手甲","Grand Champion Gauntlets"]],
  sister: [["祈祷書","Prayer Book"],["銀装の祈祷書","Silverbound Prayer Book"],["祝福の祈祷書","Blessed Prayer Book"],["灯火の賛美歌集","Candlelight Hymnal"],["慈愛の聖典","Scripture of Compassion"],["黎明の祈祷書","Dawn Prayer Book"],["救済の金装聖典","Golden Scripture of Salvation"],["永遠の祈りの書","Book of Eternal Prayer"]],
  tono: [["紙の扇子","Paper Fan"],["金縁の扇子","Gold-Edged Fan"],["あっぱれの扇子","Splendid Fan"],["お忍びの采配扇","Incognito Command Fan"],["大盤振舞の金扇","Lavish Golden Fan"],["おとぼけ将軍の軍配","Absentminded Shogun War Fan"],["天下泰平の白扇","Peaceful Realm White Fan"],["余は満足の御扇","Most-Pleased Lord Fan"]],
  gariben: [["古い参考書","Old Study Guide"],["書き込み参考書","Annotated Study Guide"],["秘伝の問題集","Secret Problem Book"],["赤点克服の虎の巻","Failing-Grade Survival Guide"],["難関突破の辞典","Entrance-Exam Dictionary"],["徹夜百日の参考書","Hundred-All-Nighters Study Guide"],["万問解答の宝典","Ten-Thousand Answers Tome"],["森羅万象の答案集","Answers to All Creation"]],
}
export const armorNamePairs: Record<ArmorClass, readonly NamePair[]> = {
  heavy: [["綿入れ胴着","Padded Jacket"],["鎖帷子","Chainmail"],["鉄板胴丸","Iron Lamellar Armor"],["鬼面の胴丸","Oni-Mask Armor"],["黒鉄の大鎧","Black-Iron Great Armor"],["修羅の武者鎧","Shura Warrior Armor"],["黄泉守りの大鎧","Yomi Guardian Armor"],["不動明王の具足","Immovable King Armor"]],
  light: [["着流し","Casual Kimono"],["旅人の羽織","Traveler Haori"],["陣羽織","Battle Surcoat"],["風切りの忍装束","Wind-Cutting Shinobi Garb"],["月影の軽装","Moonshadow Light Garb"],["夜叉織りの羽織","Yasha-Weave Haori"],["朧の旅装束","Haze Traveler Garb"],["天衣の軽装","Heavenly Light Garb"]],
  robe: [["木綿の法衣","Cotton Robe"],["見習いの法衣","Apprentice Robe"],["祈りの絹法衣","Silk Prayer Robe"],["月詠みの法衣","Moon-Reader Robe"],["星紋の祭服","Star-Crest Vestments"],["修羅祓いの法衣","Shura-Warding Robe"],["黄泉照らす祭服","Yomi-Illuminating Vestments"],["天星の法衣","Celestial Robe"]],
}
export const charmNamePairs: readonly NamePair[] = [["交通安全守","Safe Travel Charm"],["学業成就守","Academic Success Charm"],["金運招福守","Good Fortune Charm"],["厄除けの結び守","Evil-Warding Knot Charm"],["七福の鈴守","Seven-Fortune Bell Charm"],["黄泉渡りの道標守","Yomi Wayfinder Charm"],["星願いの勾玉","Star-Wish Magatama"],["万福の宝珠守","Countless Blessings Jewel Charm"]]
export const equipmentNameEnglish: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries([
  ...Object.values(weaponNamePairs).flat(), ...Object.values(armorNamePairs).flat(), ...charmNamePairs,
]))
