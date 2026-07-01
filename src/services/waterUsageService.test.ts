import { describe, it, expect } from 'vitest'
import { summarizeWaterUsage } from './waterUsageService'
import type { GardenLogEntry, Parcel } from '../data/model'

function entry(over: Partial<GardenLogEntry>): GardenLogEntry {
  return {
    type: 'arrosage',
    date: '2026-06-01',
    createdAt: Date.now(),
    ...over,
  }
}

function parcel(over: Partial<Parcel>): Parcel {
  return { name: 'Carrés du fond', ...over }
}

describe('summarizeWaterUsage', () => {
  it('cumule les litres dans les 3 fenetres glissantes selon refDate', () => {
    const parcels = [parcel({ id: '1', name: 'Carrés du fond' })]
    const entries = [
      entry({ parcelId: '1', date: '2026-06-20', volumeLiters: 5 }), // 1j avant ref -> dans 7/14/30
      entry({ parcelId: '1', date: '2026-06-10', volumeLiters: 3 }), // 11j avant ref -> dans 14/30
      entry({ parcelId: '1', date: '2026-05-25', volumeLiters: 2 }), // 27j avant ref -> dans 30 seulement
      entry({ parcelId: '1', date: '2026-04-01', volumeLiters: 10 }), // hors fenetres glissantes
    ]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      parcelId: '1',
      parcelName: 'Carrés du fond',
      liters7: 5,
      liters14: 8,
      liters30: 10,
    })
  })

  it('cumule litersYear sur toute l annee de refDate, independamment des fenetres glissantes', () => {
    const parcels = [parcel({ id: '1' })]
    const entries = [
      entry({ parcelId: '1', date: '2026-01-05', volumeLiters: 7 }),
      entry({ parcelId: '1', date: '2026-06-20', volumeLiters: 5 }),
      entry({ parcelId: '1', date: '2025-12-31', volumeLiters: 100 }),
    ]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows[0].litersYear).toBe(12)
  })

  it('cumule sur plusieurs parcelles independamment', () => {
    const parcels = [parcel({ id: '1', name: 'Carrés du fond' }), parcel({ id: '2', name: 'Allée' })]
    const entries = [
      entry({ parcelId: '1', date: '2026-06-20', volumeLiters: 5 }),
      entry({ parcelId: '2', date: '2026-06-20', volumeLiters: 8 }),
    ]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows.find((r) => r.parcelId === '1')?.liters7).toBe(5)
    expect(rows.find((r) => r.parcelId === '2')?.liters7).toBe(8)
  })

  it('exclut une parcelle sans aucune entree arrosage chiffree', () => {
    const parcels = [parcel({ id: '1', name: 'Carrés du fond' }), parcel({ id: '2', name: 'Sans eau' })]
    const entries = [entry({ parcelId: '1', date: '2026-06-20', volumeLiters: 5 })]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows).toHaveLength(1)
    expect(rows[0].parcelId).toBe('1')
  })

  it('ignore les entrees sans volumeLiters (duree seule)', () => {
    const parcels = [parcel({ id: '1' })]
    const entries = [entry({ parcelId: '1', date: '2026-06-20', durationMinutes: 15 })]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows).toHaveLength(0)
  })

  it('ignore les entrees sans parcelId', () => {
    const parcels = [parcel({ id: '1' })]
    const entries = [entry({ date: '2026-06-20', volumeLiters: 5 })]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows).toHaveLength(0)
  })

  it('ignore les entrees qui ne sont pas de type arrosage', () => {
    const parcels = [parcel({ id: '1' })]
    const entries = [entry({ type: 'remplissage_oya', parcelId: '1', date: '2026-06-20', volumeLiters: 5 })]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows).toHaveLength(0)
  })

  it('repartit egalement le volume entre les parcelles jointes (goutte-a-goutte commun)', () => {
    const parcels = [parcel({ id: '1', name: 'Carrés du fond' }), parcel({ id: '2', name: 'Allée' })]
    const entries = [entry({ parcelIds: ['1', '2'], date: '2026-06-20', volumeLiters: 10 })]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows.find((r) => r.parcelId === '1')?.liters7).toBe(5)
    expect(rows.find((r) => r.parcelId === '2')?.liters7).toBe(5)
  })

  it('trace une parcelle arrosee sans volume renseigne dans une entree multi-parcelles', () => {
    // Meme sans volume, une entree arrosage multi-parcelles ne doit pas planter ni etre
    // comptee : summarizeWaterUsage ne porte que sur les litres (0 ligne ici est correct,
    // le suivi de presence se fait ailleurs, cf. todayAgendaService).
    const parcels = [parcel({ id: '1' }), parcel({ id: '2' })]
    const entries = [entry({ parcelIds: ['1', '2'], date: '2026-06-20' })]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows).toHaveLength(0)
  })

  it('trie les resultats par nom de parcelle alphabetique', () => {
    const parcels = [parcel({ id: '1', name: 'Tomates' }), parcel({ id: '2', name: 'Allée' })]
    const entries = [
      entry({ parcelId: '1', date: '2026-06-20', volumeLiters: 1 }),
      entry({ parcelId: '2', date: '2026-06-20', volumeLiters: 1 }),
    ]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows.map((r) => r.parcelName)).toEqual(['Allée', 'Tomates'])
  })
})
