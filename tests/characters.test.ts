import { describe, expect, it } from 'vitest'
import { jobs, partyOrder } from '../src/core/data/jobs.ts'
import { partyArt } from '../src/shared/art.ts'
import { characterById, characters, charactersForJob, defaultCharacterForJob } from '../src/shared/characters.ts'

describe('キャラクターIDとジョブ・外観の対応', () => {
  it('全17ジョブに既定のキャラクターを一人ずつ持つ', () => {
    expect(characters).toHaveLength(17)
    expect(new Set(characters.map(character => character.jobId))).toEqual(new Set(partyOrder))
    for (const job of partyOrder) {
      const candidates = charactersForJob(job)
      expect(candidates.filter(character => character.isDefaultForJob)).toHaveLength(1)
      expect(defaultCharacterForJob(job)?.jobId).toBe(job)
    }
  })
  it('IDが重複せず、関係先のキャラクターと外観が実在する', () => {
    const ids = characters.map(character => character.id)
    expect(new Set(ids).size).toBe(characters.length)
    for (const character of characters) {
      expect(character.id).toMatch(/^ch_[a-z_]+_\d{2}$/)
      expect(characterById(character.id)).toBe(character)
      expect((partyArt as readonly string[]).includes(character.appearanceKey)).toBe(true)
      expect(character.role).toBe(jobs[character.jobId].role)
      expect(character.accentColor).toMatch(/^#[0-9a-f]{6}$/i)
      for (const relation of character.relations) {
        expect(relation.characterId).not.toBe(character.id)
        expect(characterById(relation.characterId)).toBeDefined()
        expect(relation.description.length).toBeGreaterThan(0)
      }
    }
    expect(characterById('missing')).toBeUndefined()
  })
  it('仮名を公式名として扱わず、性格・台詞・制作参照を保持する', () => {
    for (const character of characters) {
      expect(character.nameStatus).toBe('proposal')
      expect(character.provisionalName.length).toBeGreaterThan(0)
      expect(character.personality.length).toBeGreaterThan(0)
      expect(character.speech.length).toBeGreaterThan(0)
      expect(character.quote.length).toBeGreaterThan(0)
      expect(character.motifs.length).toBeGreaterThanOrEqual(4)
      expect(character.designNote.length).toBeGreaterThan(0)
      expect(character.provenance.method).toBe('ai-assisted')
      expect(character.provenance.promptRecord).toBe('assets/sprites/art/PROMPTS.md')
      expect(character.provenance.humanReview).toBe('pending')
    }
  })
  it('混同しやすいシスターとメイドの目印を別に記録する', () => {
    const maid = defaultCharacterForJob('maid')!, sister = defaultCharacterForJob('sister')!
    expect(maid.designNote).toContain('秋葉原')
    expect(maid.motifs).toContain('白エプロン')
    expect(sister.motifs).toContain('髪を隠す白い長いベール')
    expect(sister.motifs).toContain('青いロングローブ')
    expect(sister.motifs).not.toContain('白エプロン')
    expect(defaultCharacterForJob('vagabond')!.designNote).toContain('四角い箱一つ')
    expect(defaultCharacterForJob('farmer')!.designNote).toContain('なよなよ')
  })
})
