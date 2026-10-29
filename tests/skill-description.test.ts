import { describe, expect, it } from 'vitest'
import { jobs } from '../src/core/data/jobs'
import { skillDescription } from '../src/core/data/skillDescription'
import { realSeconds } from '../src/core/data/timing'
import { translateGameText } from '../src/shared/locales/en-game'
import { buildView, newProfile } from '../src/core/index'

describe('real-time skill descriptions', () => {
  it('renders every timed effect from its combat parameter in both languages', () => {
    for (const job of Object.values(jobs)) for (const skill of [job.skill, job.passive, job.ultimate]) {
      const ja = skillDescription(skill), en = translateGameText(ja)
      expect(ja).not.toContain('{duration}')
      expect(en).not.toMatch(/[ぁ-んァ-ヶ一-龠]/)
      if (skill.desc.includes('{duration}')) {
        expect(ja).toContain(`${realSeconds(skill.params.ms)}秒間`)
        expect(en).toContain(`${realSeconds(skill.params.ms)}s`)
      }
    }
  })
  it('preserves sub-second protection and rejects a missing duration', () => {
    expect(skillDescription(jobs.sister.ultimate)).toContain('0.75秒間')
    expect(() => skillDescription({ ...jobs.sister.ultimate, params: {} })).toThrow('Missing skill duration')
  })
  it('shows real cooldown seconds in the generated panel view', () => {
    const ninja = buildView(newProfile('test'), false).party.find(member => member.job === 'ninja')!
    expect(ninja.skills[1].desc).toBe('1.5秒間、回避率+50%（6秒ごと）')
    expect(translateGameText(ninja.skills[1].desc)).toBe('Gains 50% evasion for 1.5s. (every 6s)')
  })
})
