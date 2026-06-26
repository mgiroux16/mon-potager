import { describe, expect, it } from 'vitest'
import { LOG_ENTRY_TYPES } from '../data/model'
import { buildVoiceAudioPrompt, parseVoiceDrafts, type GardenCatalog } from './voiceParseService'

const catalog: GardenCatalog = {
  parcels: [{ id: 1, name: 'Parcelle A' }, { id: 2, name: 'Parcelle B' }],
  crops: [{ id: 10, name: 'Tomates' }],
  oyas: [{ id: 20, name: 'Oya nord' }],
  trees: [{ id: 30, name: 'Pommier' }],
}

describe('buildVoiceAudioPrompt', () => {
  it('demande de transcrire l audio, donne la date, tous les types, le catalogue et un tableau', () => {
    const prompt = buildVoiceAudioPrompt(catalog, '2026-06-25')

    expect(prompt.toLowerCase()).toContain('audio')
    expect(prompt.toLowerCase()).toContain('tableau')
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

describe('parseVoiceDrafts', () => {
  const transcript = 'j ai arrose dix litres sur la parcelle A avec des tomates'

  it('range un JSON propre a un seul element (type, volume, parcelId, cropId)', () => {
    const text = JSON.stringify([
      { type: 'arrosage', volumeLiters: 10, parcelId: 1, cropId: 10, time: '08:00' },
    ])
    const drafts = parseVoiceDrafts(text, catalog, transcript)
    expect(drafts).toHaveLength(1)
    const { draft, parsed } = drafts[0]
    expect(parsed).toBe(true)
    expect(draft.type).toBe('arrosage')
    expect(draft.volumeLiters).toBe(10)
    expect(draft.parcelId).toBe(1)
    expect(draft.cropId).toBe(10)
    expect(draft.time).toBe('08:00')
  })

  it('separe une phrase en deux actions distinctes', () => {
    const text = JSON.stringify([
      { type: 'recolte', quantityKg: 3, cropId: 10 },
      { type: 'arrosage', volumeLiters: 20, cropId: 10 },
    ])
    const drafts = parseVoiceDrafts(text, catalog, transcript)
    expect(drafts).toHaveLength(2)
    expect(drafts[0].draft.type).toBe('recolte')
    expect(drafts[0].draft.quantityKg).toBe(3)
    expect(drafts[1].draft.type).toBe('arrosage')
    expect(drafts[1].draft.volumeLiters).toBe(20)
  })

  it('plafonne a 5 actions, le reste est ignore', () => {
    const text = JSON.stringify(
      Array.from({ length: 6 }, (_, i) => ({ type: 'recolte', quantityKg: i + 1 })),
    )
    const drafts = parseVoiceDrafts(text, catalog, transcript)
    expect(drafts).toHaveLength(5)
    expect(drafts.map((d) => d.draft.quantityKg)).toEqual([1, 2, 3, 4, 5])
  })

  it('extrait le tableau JSON meme entoure de texte ou d un bloc markdown', () => {
    const text =
      'Voici les entrees :\n```json\n[{"type":"recolte","quantityKg":2,"cropId":10}]\n```\nVoila.'
    const drafts = parseVoiceDrafts(text, catalog, transcript)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].draft.type).toBe('recolte')
    expect(drafts[0].draft.quantityKg).toBe(2)
    expect(drafts[0].draft.cropId).toBe(10)
  })

  it('ignore un champ inconnu et retombe sur note si le type est invalide', () => {
    const text = JSON.stringify([{ type: 'pas_un_type', foo: 'bar', description: 'coucou' }])
    const { draft } = parseVoiceDrafts(text, catalog, transcript)[0]
    expect(draft.type).toBe('note')
    expect((draft as Record<string, unknown>).foo).toBeUndefined()
    expect(draft.description).toBe('coucou')
  })

  it('rejette un id absent du catalogue mais garde le reste', () => {
    const text = JSON.stringify([{ type: 'arrosage', volumeLiters: 5, parcelId: 999 }])
    const { draft } = parseVoiceDrafts(text, catalog, transcript)[0]
    expect(draft.parcelId).toBeUndefined()
    expect(draft.volumeLiters).toBe(5)
    expect(draft.type).toBe('arrosage')
  })

  it('ignore un nombre non numerique', () => {
    const text = JSON.stringify([{ type: 'arrosage', volumeLiters: 'beaucoup' }])
    const { draft } = parseVoiceDrafts(text, catalog, transcript)[0]
    expect(draft.volumeLiters).toBeUndefined()
  })

  it('repli note + transcript quand le JSON est casse ou absent', () => {
    const drafts = parseVoiceDrafts('aucun json ici', catalog, transcript)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].parsed).toBe(false)
    expect(drafts[0].draft.type).toBe('note')
    expect(drafts[0].draft.description).toBe(transcript)
  })

  it('repli note quand le tableau JSON est vide', () => {
    const drafts = parseVoiceDrafts('[]', catalog, transcript)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].parsed).toBe(false)
    expect(drafts[0].draft.type).toBe('note')
  })
})
