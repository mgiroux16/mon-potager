import { describe, it, expect } from 'vitest'
import { summarizeHarvests } from './harvestService'
import type { GardenLogEntry, Crop } from '../data/model'

function entry(over: Partial<GardenLogEntry>): GardenLogEntry {
  return {
    type: 'recolte',
    date: '2026-06-01',
    createdAt: Date.now(),
    ...over,
  }
}

function crop(over: Partial<Crop>): Crop {
  return { name: 'Tomates', status: 'en_recolte', ...over }
}

describe('summarizeHarvests', () => {
  it('somme plusieurs cueillettes de la meme annee et culture', () => {
    const crops = [crop({ id: 1, name: 'Tomates' })]
    const entries = [
      entry({ cropId: 1, date: '2026-06-01', quantityKg: 2 }),
      entry({ cropId: 1, date: '2026-07-15', quantityKg: 3 }),
    ]
    const rows = summarizeHarvests(entries, crops)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ cropId: 1, cropName: 'Tomates', year: 2026, totalKg: 5 })
  })

  it('ne calcule pas totalEuros si la culture n a pas de pricePerKg', () => {
    const crops = [crop({ id: 1 })]
    const entries = [entry({ cropId: 1, quantityKg: 2 })]
    const rows = summarizeHarvests(entries, crops)
    expect(rows[0].totalEuros).toBeUndefined()
  })

  it('calcule totalEuros si pricePerKg est renseigne', () => {
    const crops = [crop({ id: 1, pricePerKg: 4 })]
    const entries = [entry({ cropId: 1, quantityKg: 2 })]
    const rows = summarizeHarvests(entries, crops)
    expect(rows[0].totalEuros).toBe(8)
  })

  it('utilise un nom de repli pour une entree orpheline', () => {
    const crops: Crop[] = []
    const entries = [entry({ cropId: 99, quantityKg: 1 })]
    const rows = summarizeHarvests(entries, crops)
    expect(rows[0].cropName).toBe('(culture supprimée)')
  })

  it('separe les annees differentes du meme legume', () => {
    const crops = [crop({ id: 1 })]
    const entries = [
      entry({ cropId: 1, date: '2025-08-01', quantityKg: 1 }),
      entry({ cropId: 1, date: '2026-08-01', quantityKg: 2 }),
    ]
    const rows = summarizeHarvests(entries, crops)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.year).sort()).toEqual([2025, 2026])
  })

  it('ignore les entrees sans quantityKg ou sans cropId', () => {
    const crops = [crop({ id: 1 })]
    const entries = [
      entry({ cropId: 1, quantityKg: undefined }),
      entry({ cropId: undefined, quantityKg: 2 }),
    ]
    const rows = summarizeHarvests(entries, crops)
    expect(rows).toHaveLength(0)
  })

  it('trie les resultats par nom de culture alphabetique', () => {
    const crops = [crop({ id: 1, name: 'Tomates' }), crop({ id: 2, name: 'Courgettes' })]
    const entries = [entry({ cropId: 1, quantityKg: 1 }), entry({ cropId: 2, quantityKg: 1 })]
    const rows = summarizeHarvests(entries, crops)
    expect(rows.map((r) => r.cropName)).toEqual(['Courgettes', 'Tomates'])
  })
})
