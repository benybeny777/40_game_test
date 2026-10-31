import { expect, it } from 'vitest'
import { jobs } from '../src/core/data/jobs'
import { createCombatLabelGate } from '../src/renderer/combatLabelGate'

it('leaves visual space between routine skills while preserving combinations and loot', () => {
  const gate = createCombatLabelGate()
  expect(gate.take(jobs.samurai.skill.name, 0)).toBe(true)
  expect(gate.take(jobs.ninja.skill.name, 200)).toBe(false)
  expect(gate.take('注目会心', 201)).toBe(true)
  expect(gate.take('伝説「太刀」', 202)).toBe(true)
  expect(gate.take(jobs.ninja.skill.name, 3300)).toBe(true)
  expect(gate.take(jobs.samurai.skill.name, 6800)).toBe(false)
  expect(gate.take(jobs.samurai.skill.name, 9000)).toBe(true)
})
it('allows a fresh visible session to introduce its skills again', () => {
  const gate = createCombatLabelGate()
  gate.take(jobs.samurai.skill.name, 100)
  gate.clear()
  expect(gate.take(jobs.samurai.skill.name, 200)).toBe(true)
})
it('does not promote repeated sales or unsuccessful rolls into celebrations', () => {
  const gate = createCombatLabelGate()
  expect(gate.routine('自動売却：刀', 'info')).toBe(true)
  expect(gate.routine('ハズレ', 'info')).toBe(true)
  expect(gate.take('自動売却：刀', 0, 'info')).toBe(true)
  expect(gate.take('自動売却：小刀', 100, 'info')).toBe(false)
  expect(gate.take('注目会心', 100, 'combo')).toBe(true)
  expect(gate.take('伝説の刀', 101, 'loot')).toBe(true)
})
