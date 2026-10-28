import type { ThemeDefinition } from '../shared/commerce.ts'

export interface CatalogEntry { sku: string; itemdefid: number; name: string; description: string; theme: ThemeDefinition }
/** Item identities and cosmetics are independent of combat stats and the local equipment bag. */
export const catalog: readonly CatalogEntry[] = [
  { sku: 'ground_sakura', itemdefid: 1001, name: '桜色の足元', description: '地面の線と小さな飾りを桜色に。能力やドロップ率は変わりません。',
    theme: { id: 'sakura', band: 'rgba(45,20,37,0.46)', line: '#cda0b5', dotA: '#bf839d', dotB: '#86556e', prop: '#e5b6ca', propHeight: 2 } },
  { sku: 'ground_moon', itemdefid: 1002, name: '月明かりの足元', description: '地面を静かな青白い月明かりに。能力やドロップ率は変わりません。',
    theme: { id: 'moon', band: 'rgba(13,23,41,0.46)', line: '#a5bfdb', dotA: '#839ebf', dotB: '#526682', prop: '#d9e3ef', propHeight: 2 } },
  { sku: 'ground_lantern', itemdefid: 1003, name: '提灯色の足元', description: '地面を温かい琥珀と朱色に。能力やドロップ率は変わりません。',
    theme: { id: 'lantern', band: 'rgba(37,22,13,0.46)', line: '#d3a566', dotA: '#b97943', dotB: '#8e4f38', prop: '#e7bf7e', propHeight: 3 } },
  { sku: 'ground_abyss', itemdefid: 1004, name: '深淵色の足元', description: '地面を深い紫と淡い鉱石色に。能力やドロップ率は変わりません。',
    theme: { id: 'abyss', band: 'rgba(24,15,39,0.46)', line: '#a799c8', dotA: '#83719e', dotB: '#58456d', prop: '#c0aad8', propHeight: 3 } },
]
export const findProduct = (sku: string) => catalog.find(product => product.sku === sku)
