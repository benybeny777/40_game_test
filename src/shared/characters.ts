import { jobs, type JobRole } from '../core/data/jobs.ts'
import type { JobId } from '../core/sim/types.ts'

/** A character identity survives job, costume and display-name changes. Names below are proposals, not UI names. */
export interface CharacterDefinition {
  id: string; jobId: JobId; appearanceKey: JobId; isDefaultForJob: boolean
  provisionalName: string; nameStatus: 'proposal'; role: JobRole; accentColor: string
  personality: string; speech: string; motifs: readonly string[]; quote: string
  relations: readonly { characterId: string; description: string }[]
  designNote: string
  provenance: { method: 'ai-assisted'; promptRecord: string; humanReview: 'pending' }
}
type CharacterSeed = Omit<CharacterDefinition, 'appearanceKey' | 'isDefaultForJob' | 'nameStatus' | 'role' | 'accentColor' | 'provenance'> & { isDefaultForJob?: boolean }
const define = <T extends string>(seed: CharacterSeed & { id: T }): CharacterDefinition & { id: T } => ({ ...seed, appearanceKey: seed.jobId, isDefaultForJob: seed.isDefaultForJob ?? true,
  nameStatus: 'proposal', role: jobs[seed.jobId].role, accentColor: jobs[seed.jobId].color,
  provenance: { method: 'ai-assisted', promptRecord: 'assets/sprites/art/PROMPTS.md', humanReview: 'pending' } })

/** Job and art registries are separate authorities; this registry maps durable character IDs to them. */
export const characters = [
  define({ id: 'ch_samurai_01', jobId: 'samurai', provisionalName: '朔十郎（さくじゅうろう）',
    personality: '律儀で口数が少ない。夜道で迷子を放っておけない。', speech: '短い常体。怒鳴らず、結論から話す。',
    motifs: ['紺の袴', '赤い襟巻き', '黒い結び髪', '刀'], quote: '道は、斬って開く。',
    relations: [{ characterId: 'ch_ninja_01', description: '偵察の腕を信頼するが、置き手紙の悪戯には毎回困る。' }],
    designNote: '番長の幅広い拳と区別し、細い刀と縦の姿勢を優先する。' }),
  define({ id: 'ch_ninja_01', jobId: 'ninja', provisionalName: '影緒（かげお）',
    personality: '用心深いが、仲間を驚かせる小さな悪戯が好き。', speech: '軽い口調で短く、語尾を引かない。',
    motifs: ['銀髪', '青緑の帯', '黒い忍装束', '忍具'], quote: '先に見てきた。裏口もあるよ。',
    relations: [{ characterId: 'ch_samurai_01', description: '真面目すぎる剣士に抜け道を教える相棒。' }],
    designNote: 'メイドと銀髪が共通でも、顔布・青緑の長い帯・低い構えで区別。' }),
  define({ id: 'ch_jirai_01', jobId: 'jirai', provisionalName: 'ねむり',
    personality: '好きなものへの集中力が強い。怖がりなのに呪いには詳しい。', speech: '柔らかい小声。親しい相手には少しだけ重い言い回し。',
    motifs: ['黒いツインテール', '桃色の結び飾り', '紫黒のフリル', 'ハートの呪具'], quote: 'ここ、忘れないように印をつけたの。',
    relations: [{ characterId: 'ch_gyaru_01', description: '賑やかな友人に誘われ、写真に写るときだけ少し笑う。' }],
    designNote: 'メイドの白いエプロンを使わず、ハートとツインテールを輪郭の目印にする。' }),
  define({ id: 'ch_otaku_01', jobId: 'otaku', provisionalName: '灯太（とうた）',
    personality: '照れ屋だが、仲間の見せ場を誰より喜ぶ。道具の手入れが細かい。', speech: '普段は遠慮がち。応援するときだけ勢いが出る。',
    motifs: ['茶髪', '角眼鏡', '生成りの上着', '二色のペンライト', 'リュック'], quote: '今の一撃、もう一回見たい！',
    relations: [{ characterId: 'ch_gariben_01', description: '道具の資料を交換する仲。説明が長くなる者同士。' }],
    designNote: 'ガリ勉と区別して角眼鏡、明るい上着、二本の光を使う。' }),
  define({ id: 'ch_pachipro_01', jobId: 'pachipro', provisionalName: '弾吉（だんきち）',
    personality: '軽口を叩くが、約束した貸し借りは細かく覚えている。', speech: '気楽な常体。勝っても仲間を見下さない。',
    motifs: ['流した金髪', 'えんじの上着', '金の鎖', '金属の玉'], quote: '流れは来る。来なきゃ、待つさ。',
    relations: [{ characterId: 'ch_vagabond_01', description: '拾った道具の使い道を相談する、年の離れた知恵比べ相手。' }],
    designNote: '実在の機種・店舗・メーカーの意匠や商標を持たせない。' }),
  define({ id: 'ch_miko_01', jobId: 'miko', provisionalName: '朱音（あかね）',
    personality: '落ち着いて面倒見がよい。片付けの手順には少し厳しい。', speech: '穏やかな丁寧語。危険なときは言い切る。',
    motifs: ['黒い長髪', '赤い結び飾り', '白と朱の衣装', '御幣'], quote: '深呼吸を。穢れは、こちらで祓います。',
    relations: [{ characterId: 'ch_sister_01', description: '祈り方は違っても、傷ついた仲間を先に助ける点で通じ合う。' }],
    designNote: 'シスターの青い長衣・白い長ベール・祈祷書を流用しない。' }),
  define({ id: 'ch_bancho_01', jobId: 'bancho', provisionalName: '鉄路（てつじ）',
    personality: '大柄で声も大きいが、小さい仲間の歩幅に合わせて歩く。', speech: 'ぶっきらぼう。相手の出自ではなく卑怯な行動に怒る。',
    motifs: ['大きなリーゼント', '黒い長い上着', '白い胸巻き', '拳'], quote: '後ろは見なくていい。俺がいる。',
    relations: [{ characterId: 'ch_sukeban_01', description: '守り方を巡って口喧嘩するが、背中は任せ合える。' }],
    designNote: 'スケバンと配色が近くても、幅広い肩と拳の輪郭を崩さない。' }),
  define({ id: 'ch_gyaru_01', jobId: 'gyaru', provisionalName: 'りりか',
    personality: '初対面にも物怖じしない。仲間の小さな長所を見つけるのが得意。', speech: '明るい現代語。流行語は少量にして読みやすく。',
    motifs: ['大きな金髪', '桃色の上着', '厚底靴', 'デコスマホ'], quote: 'その構え、いいじゃん。次も決めよ！',
    relations: [{ characterId: 'ch_jirai_01', description: '相手のペースを尊重して誘う友人。無理に笑わせようとはしない。' }],
    designNote: 'メイドのフリルと混ぜず、携帯電話・明るい髪・厚底で識別する。' }),
  define({ id: 'ch_sukeban_01', jobId: 'sukeban', provisionalName: '紫乃（しの）',
    personality: '筋が通らないことが嫌い。弱った相手を仲間で囲むのは嫌う。', speech: '低く短い口調。威圧は敵へ向け、仲間には手短に助言。',
    motifs: ['濃紫の長髪', '長い紺のセーラー服', '赤いスカーフ', '木刀'], quote: '道を空けな。仲間が通る。',
    relations: [{ characterId: 'ch_bancho_01', description: '力任せの番長へ、周囲を見るよう釘を刺す。' }],
    designNote: '赤いスカーフと足首までの長い裾、肩の木刀が目印。' }),
  define({ id: 'ch_farmer_01', jobId: 'farmer', provisionalName: 'へい太',
    personality: '怖がりで腰が引けるが、置き去りにした畑と仲間が気になる。', speech: 'おずおずした素朴な言葉。大声の勇猛な口上は使わない。',
    motifs: ['細身', '猫背', '大きすぎる麦わら帽子', 'くたびれた野良着', '竹槍'], quote: 'こ、これ以上は……ちょっと、突くぞ。',
    relations: [{ characterId: 'ch_rikishi_01', description: '自分と対照的な大柄の仲間の後ろだと、少し安心する。' }],
    designNote: '確定指定：なよなよ、細い手足、内向きの膝、逃げ腰。勇敢な筋肉質の農民にしない。' }),
  define({ id: 'ch_maid_01', jobId: 'maid', provisionalName: 'こはく',
    personality: '接客は明るく、手仕事は速い。旅の途中でも小物を整頓する。', speech: '軽快な接客の丁寧語。決め台詞を反復しすぎない。',
    motifs: ['銀髪ボブ', '大きなフリルのヘッドドレス', '黒白桃', '白エプロン', '短いふんわりスカート', 'ナイフ'], quote: 'ご注文の一撃、お待たせしました。',
    relations: [{ characterId: 'ch_sister_01', description: '衣装を間違えられがちな二人。互いの仕事ぶりは認めている。' }],
    designNote: '確定指定：秋葉原のメイド喫茶風。シスターの長いベール・青い長衣・祈祷書を持たせない。' }),
  define({ id: 'ch_jiangshi_01', jobId: 'jiangshi', provisionalName: '鈴鈴（りんりん）',
    personality: '寝ぼけ気味でのんびり。転んでも気にせず起き上がる。', speech: '短く間のある言葉。幼児語にはしない。',
    motifs: ['額の札', '紫の中華服', '丸い帽子', '淡い青緑の肌', 'そろえた足の跳躍'], quote: 'まだ、終わってない……ぴょん。',
    relations: [{ characterId: 'ch_miko_01', description: '札を整えてもらうが、剥がそうとされると静かに逃げる。' }],
    designNote: '額の札と跳躍が目印。吸血鬼のマントや既存作品の固有紋章へ寄せない。' }),
  define({ id: 'ch_vagabond_01', jobId: 'vagabond', provisionalName: '源じい（げんじい）',
    personality: '路上の小さな変化に敏感。人の忠告より自分で見たものを信じる。', speech: 'しわがれた常体。短い皮肉と実用的な助言。',
    motifs: ['痩せた白髪の老人', 'ぼさぼさの髭', '汚れて破れた服', '四角い段ボール箱一つ', '拾った空き缶'], quote: '捨てるな。まだ、使い道がある。',
    relations: [{ characterId: 'ch_pachipro_01', description: '若い勝負師の無駄遣いをからかい、道具を修理して返す。' }],
    designNote: '確定指定：汚い貧相な老人が、四角い箱一つを胴に着る。肩鎧・腰鎧・複数箱・屈強な戦士へ変えない。' }),
  define({ id: 'ch_rikishi_01', jobId: 'rikishi', provisionalName: '大福丸（だいふくまる）',
    personality: '穏やかで食事を大事にする。土壇場では動じず踏ん張る。', speech: 'ゆったりと落ち着いた常体。相撲の言葉は自然な場面だけ。',
    motifs: ['大きく丸い体', 'まげ', '深紅のまわし', '裸足', '開いた手のひら'], quote: '足元を固めろ。ここは通さん。',
    relations: [{ characterId: 'ch_farmer_01', description: '怖がる農民を急かさず、自分の歩幅を小さくして待つ。' }],
    designNote: '番長の長い黒上着や拳と区別し、丸い体・低い構え・張り手を優先。' }),
  define({ id: 'ch_sister_01', jobId: 'sister', provisionalName: 'ノエ',
    personality: '静かで辛抱強い。失敗した仲間にも帰る場所を用意する。', speech: '柔らかく簡潔な丁寧語。説教より手当てを先にする。',
    motifs: ['髪を隠す白い長いベール', '青いロングローブ', '大きな祈祷書', '金の十字架'], quote: '帰る道は、まだ閉じていません。',
    relations: [{ characterId: 'ch_miko_01', description: '手当ての役割分担が上手な同僚。互いの祈りを尊重する。' }],
    designNote: '確定指定：白ベール＋青長衣。銀髪ボブ、短いフリル裾、白エプロン、桃色リボンを使わずメイドと分ける。' }),
  define({ id: 'ch_tono_01', jobId: 'tono', provisionalName: '晴綱（はるつな）',
    personality: '尊大だが人がよく、空回りした後は仲間を素直に褒める。', speech: '大仰な殿様言葉。采配は奇妙でも味方の足を引っ張らない。',
    motifs: ['白塗りの顔', '高いちょんまげ', 'ぶかぶかの紫黄の装束', '扇子', '間の抜けた表情'], quote: '余の名案じゃ。皆、元気を出せい！',
    relations: [{ characterId: 'ch_gariben_01', description: '難しい話は理解しきれないが、学問の働きを大げさに称える。' }],
    designNote: 'オリジナルのおとぼけ殿。特定の芸能人の顔、番組の衣装や固有の決め台詞を再現しない。' }),
  define({ id: 'ch_gariben_01', jobId: 'gariben', provisionalName: '墨人（すみと）',
    personality: '普段は冴えず話すのが苦手。問題を解くときだけ背筋が伸びる。', speech: '考えながら途切れる常体。分析が決まると短く断言する。',
    motifs: ['分厚い丸眼鏡', 'ぼさぼさの黒髪', 'よれた黒い学ラン', '大量の参考書', '大きな鞄'], quote: '待って……その動き、さっきの問題と同じだ。',
    relations: [{ characterId: 'ch_otaku_01', description: '互いの好きな資料を貸す友人。興味の向く分野は違う。' }],
    designNote: '確定指定は太い丸眼鏡とぼさ髪。既存の漫画キャラの顔・固有名・口癖そのものを使わない。' }),
] as const

export type CharacterId = typeof characters[number]['id']
export const characterById = (id: string) => characters.find(character => character.id === id)
export const charactersForJob = (jobId: JobId) => characters.filter(character => character.jobId === jobId)
export const defaultCharacterForJob = (jobId: JobId) => characters.find(character => character.jobId === jobId && character.isDefaultForJob)
