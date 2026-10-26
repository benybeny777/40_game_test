export interface AreaDef { no: number; name: string; boss: string; weights: Array<{ id: string; weight: number }>; maxWave: number }
// Weights (05-content-balance.md §4). Area 1 is the user-approved 1:1:1.
export const areas: AreaDef[] = [
  { no: 1, name: '夜の街道', boss: 'ooni', maxWave: 4, weights: [{ id: 'chochin', weight: 1 }, { id: 'kappa', weight: 1 }, { id: 'onibi', weight: 1 }] },
  { no: 2, name: 'シャッター商店街', boss: 'manekitaisho', maxWave: 4, weights: [{ id: 'karakasa', weight: 1 }, { id: 'bakeneko', weight: 1 }, { id: 'manekimodoki', weight: 0.5 }] },
  { no: 3, name: '電脳街', boss: 'denno_kyubi', maxWave: 4, weights: [{ id: 'bugsei', weight: 1 }, { id: 'noroifig', weight: 0.7 }, { id: 'popuponi', weight: 0.8 }] },
]
export const stagesPerArea = 5
/** From area 2 on, the previous area's enemies make up this share of each wave. */
export const previousAreaShare = 0.2
// Wave 10 = the area boss plus two escorts (05-content-balance.md §3). Waves 7–9 use the area's maxWave.
export const waveSizes = [{ through: 3, count: 2 }, { through: 6, count: 3 }, { through: 9, count: 0 }, { through: 10, count: 2 }]
export const areaOf = (stageNo: number) => areas[Math.min(areas.length - 1, Math.floor((stageNo - 1) / stagesPerArea))]
export function stageLabel(stageNo: number) {
  const area = Math.floor((stageNo - 1) / stagesPerArea) + 1
  return { area, label: `${area}-${(stageNo - 1) % stagesPerArea + 1}`, areaName: areas[area - 1]?.name ?? '???' }
}
