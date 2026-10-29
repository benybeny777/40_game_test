/** Wait for the bundled fonts; a missing file is a loading error, not a silent OS substitution. */
export async function loadUiFonts(fonts: Pick<FontFaceSet, 'load'> = document.fonts): Promise<void> {
  const faces = await Promise.all([400, 700].map(weight => fonts.load(weight + ' 16px "BIZ UDPGothic"', '黄泉の迷宮 ABC 123')))
  if (faces.some(loaded => loaded.length === 0)) throw new Error('Bundled UI font is missing: BIZ UDPGothic')
}
