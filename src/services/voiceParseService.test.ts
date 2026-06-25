import { describe, expect, it } from 'vitest'
import { LOG_ENTRY_TYPES } from '../data/model'
import { buildVoicePrompt, type GardenCatalog } from './voiceParseService'

const catalog: GardenCatalog = {
  parcels: [{ id: 1, name: 'Parcelle A' }, { id: 2, name: 'Parcelle B' }],
  crops: [{ id: 10, name: 'Tomates' }],
  oyas: [{ id: 20, name: 'Oya nord' }],
  trees: [{ id: 30, name: 'Pommier' }],
}

describe('buildVoicePrompt', () => {
  it('contient la phrase, la date du jour, tous les types et le catalogue', () => {
    const prompt = buildVoicePrompt('j ai arrose dix litres sur la parcelle A', catalog, '2026-06-25')

    expect(prompt).toContain('j ai arrose dix litres sur la parcelle A')
    expect(prompt).toContain('2026-06-25')
    for (const type of LOG_ENTRY_TYPES) {
      expect(prompt).toContain(type)
    }
    expect(prompt).toContain('Parcelle A')
    expect(prompt).toContain('1')
    expect(prompt).toContain('Tomates')
    expect(prompt).toContain('10')
  })
})
