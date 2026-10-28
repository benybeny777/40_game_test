import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { enemies, partyOrder } from '../src/core/index.ts'
import { parsePalette, parseSprite } from '../src/renderer/strip/sprites/parse'
import { partyArt, enemyArt } from '../src/shared/art'

const root = process.cwd()
const palette = parsePalette(readFileSync(join(root, 'assets/palettes/base32.txt'), 'utf8'))
const dir = join(root, 'assets/sprites/src')
const sprites = readdirSync(dir).filter((file) => file.endsWith('.sprite.txt')).map((file) => parseSprite(readFileSync(join(dir, file), 'utf8'), palette))

describe('テキストのスプライト', () => {
  it('パレットは32色', () => { expect(Object.keys(palette)).toHaveLength(32) })
  it('全ジョブ・全敵・弾のスプライトがあり、必要なアニメを持つ', () => {
    const names = new Set(sprites.map((sprite) => sprite.name))
    expect(new Set(partyArt)).toEqual(new Set(partyOrder))
    for (const id of [...Object.values(enemies).map((enemy) => enemy.sprite ?? enemy.id), 'projectiles']) expect(names.has(id) || (enemyArt as readonly string[]).includes(id), id).toBe(true)
    for (const sheet of ['party-atlas.png', 'party-extra-a.png', 'party-extra-b.png', 'tono.png', 'gariben.png', 'enemy-atlas.png', 'enemy-attack.png', 'dungeon-backgrounds.png']) {
      const bytes = readFileSync(join(root, 'assets/sprites/art', sheet))
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    }
    for (const sprite of sprites.filter((candidate) => (partyOrder as string[]).includes(candidate.name))) {
      expect(Object.keys(sprite.anims)).toEqual(expect.arrayContaining(['idle', 'walk', 'attack']))
    }
  })
  it('全コマが指定の大きさ', () => {
    for (const sprite of sprites) for (const anim of Object.values(sprite.anims)) for (const frame of anim.frames) {
      expect(frame).toHaveLength(sprite.height)
      for (const row of frame) expect(row).toHaveLength(sprite.width)
    }
  })
  it('知らない色・はみ出し・範囲外のアンカーはエラー', () => {
    const head = 'name: x\nsize: 4x2\nanchor: 1,1\nanim idle\nframe\n'
    expect(() => parseSprite(`${head}..Q.`, palette)).toThrow('unknown palette char')
    expect(() => parseSprite(`${head}aaaaa`, palette)).toThrow('wide')
    expect(() => parseSprite('name: x\nsize: 4x2\nanchor: 9,1\nanim idle\nframe\naa', palette)).toThrow('anchor')
    expect(parseSprite(`${head}aa`, palette).anims.idle.frames[0]).toEqual(['....', 'aa..'])
  })
})
