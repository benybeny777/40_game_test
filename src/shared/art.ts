/** Shared logical layout and atlas identities. Art files are resolved by Vite, never by runtime paths. */
export const PLAY_DOTS = 48
export const PARTY_SPACING_SCALE = 1.8
export const partyArtGroups = [
  ['samurai', 'ninja', 'jirai', 'otaku', 'pachipro'],
  ['miko', 'bancho', 'gyaru', 'sukeban', 'farmer'],
  ['maid', 'jiangshi', 'vagabond', 'rikishi', 'sister'],
  ['tono'], ['gariben'],
] as const
export const partyArt = partyArtGroups.flat()
export const enemyArt = ['chochin', 'kappa', 'onibi', 'ooni', 'karakasa', 'bakeneko', 'manekimodoki', 'manekitaisho', 'bugsei', 'popuponi', 'noroifig', 'denno_kyubi'] as const
