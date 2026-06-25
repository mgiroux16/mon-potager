import { describe, expect, it } from 'vitest'
import { LOG_ENTRY_TYPES } from '../data/model'
import { buildVoicePrompt, parseVoiceDraft, type GardenCatalog } from './voiceParseService'

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

describe('parseVoiceDraft', () => {
  const transcript = 'j ai arrose dix litres sur la parcelle A avec des tomates'

  it('range un JSON propre (type, volume, parcelId, cropId)', () => {
    const text = JSON.stringify({
      type: 'arrosage',
      volumeLiters: 10,
      parcelId: 1,
      cropId: 10,
      time: '08:00',
    })
    const { draft, parsed } = parseVoiceDraft(text, catalog, transcript)
    expect(parsed).toBe(true)
    expect(draft.type).toBe('arrosage')
    expect(draft.volumeLiters).toBe(10)
    expect(draft.parcelId).toBe(1)
    expect(draft.cropId).toBe(10)
    expect(draft.time).toBe('08:00')
  })

  it('extrait le JSON meme entoure de texte ou d un bloc markdown', () => {
    const text = 'Voici l entree :\n```json\n{"type":"recolte","quantityKg":2,"cropId":10}\n```\nVoila.'
    const { draft, parsed } = parseVoiceDraft(text, catalog, transcript)
    expect(parsed).toBe(true)
    expect(draft.type).toBe('recolte')
    expect(draft.quantityKg).toBe(2)
    expect(draft.cropId).toBe(10)
  })

  it('ignore un champ inconnu et retombe sur note si le type est invalide', () => {
    const text = JSON.stringify({ type: 'pas_un_type', foo: 'bar', description: 'coucou' })
    const { draft } = parseVoiceDraft(text, catalog, transcript)
    expect(draft.type).toBe('note')
    expect((draft as Record<string, unknown>).foo).toBeUndefined()
    expect(draft.description).toBe('coucou')
  })

  it('rejette un id absent du catalogue mais garde le reste', () => {
    const text = JSON.stringify({ type: 'arrosage', volumeLiters: 5, parcelId: 999 })
    const { draft } = parseVoiceDraft(text, catalog, transcript)
    expect(draft.parcelId).toBeUndefined()
    expect(draft.volumeLiters).toBe(5)
    expect(draft.type).toBe('arrosage')
  })

  it('ignore un nombre non numerique', () => {
    const text = JSON.stringify({ type: 'arrosage', volumeLiters: 'beaucoup' })
    const { draft } = parseVoiceDraft(text, catalog, transcript)
    expect(draft.volumeLiters).toBeUndefined()
  })

  it('repli note + transcript quand le JSON est casse ou absent', () => {
    const { draft, parsed } = parseVoiceDraft('aucun json ici', catalog, transcript)
    expect(parsed).toBe(false)
    expect(draft.type).toBe('note')
    expect(draft.description).toBe(transcript)
  })
})
