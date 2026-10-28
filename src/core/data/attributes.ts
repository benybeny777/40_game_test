import type { JobId } from '../sim/types.ts'
export type AttributeKey = 'str' | 'dex' | 'vit' | 'int'
export type Attributes = Record<AttributeKey, number>
export const attributeKeys: AttributeKey[] = ['str', 'dex', 'vit', 'int']
export const attributeLabels: Record<AttributeKey, string> = { str: '筋力', dex: '敏捷', vit: '体力', int: '知力' }
export const emptyAttributes = (): Attributes => ({ str: 0, dex: 0, vit: 0, int: 0 })
const def = (main: Exclude<AttributeKey, 'vit'>, str: number, dex: number, vit: number, int: number) => ({ main, base: { str, dex, vit, int },
  auto: { str: main === 'str' ? 6 : 1, dex: main === 'dex' ? 6 : 1, vit: 2, int: main === 'int' ? 6 : 1 } as Attributes })
export const attributeDefs: Record<JobId, ReturnType<typeof def>> = {
  samurai: def('str', 12, 8, 10, 3), ninja: def('dex', 7, 14, 7, 4), jirai: def('int', 4, 8, 7, 14),
  otaku: def('int', 5, 7, 8, 13), pachipro: def('dex', 7, 12, 8, 6), miko: def('int', 4, 7, 8, 14),
  bancho: def('str', 13, 6, 12, 2), gyaru: def('int', 4, 10, 6, 13), sukeban: def('str', 12, 10, 8, 3),
  farmer: def('str', 10, 9, 7, 4), maid: def('dex', 5, 14, 6, 8), jiangshi: def('str', 12, 7, 10, 4),
  vagabond: def('dex', 5, 11, 6, 9), rikishi: def('str', 14, 4, 14, 2), sister: def('int', 4, 6, 8, 15),
  tono: def('int', 4, 7, 7, 15), gariben: def('int', 3, 6, 5, 18),
}
export const attributeBalance = { pointsPerLevel: 3, mainAtk: 0.015, vitHp: 6, vitDef: 0.25, strDef: 0.08, dexInterval: 0.0015, dexCri: 0.0008, dexEva: 0.0003 }
export const requirementsBalance = { weaponPerRank: 0.7, heavyPerRank: 0.4, lightPerRank: 0.55, robePerRank: 0.55, charmPerRank: 0.1,
  heavyStr: 8, heavyVit: 10, lightDex: 8, lightVit: 5, robeInt: 8, robeVit: 4 }
