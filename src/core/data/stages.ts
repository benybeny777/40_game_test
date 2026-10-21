// Equal provisional weights explicitly approved by the user for area 1.
export const areaOneWeights = [{ id: 'chochin', weight: 1 }, { id: 'kappa', weight: 1 }, { id: 'onibi', weight: 1 }]
// Wave 10 = the area boss plus two escorts (05-content-balance.md §3).
export const waveSizes = [{ through: 3, count: 2 }, { through: 6, count: 3 }, { through: 9, count: 4 }, { through: 10, count: 2 }]
export const areas = [{ no: 1, name: '夜の街道', boss: 'ooni', stages: 5 }]
export const stagesPerArea = 5
export function stageLabel(stageNo: number) {
  const area = Math.floor((stageNo - 1) / stagesPerArea) + 1
  return { area, label: `${area}-${(stageNo - 1) % stagesPerArea + 1}`, areaName: areas[area - 1]?.name ?? '???' }
}
