import { describe, it, expect } from 'vitest'
import {
  buildJournalAttachment,
  buildCropAttachment,
  buildSeasonAttachment,
  buildExpensesAttachment,
} from './assistantContext'
import type { Crop, Expense, GardenLogEntry, Parcel, Variety } from '../data/model'
import type { LogRefs } from './logView'
import type { HarvestRow } from './harvestService'
import type { CropSeasonRow, ParcelSeasonRow } from './seasonSummaryService'

const emptyRefs: LogRefs = {
  parcels: new Map(),
  crops: new Map(),
  oyas: new Map(),
  trees: new Map(),
}

describe('buildJournalAttachment', () => {
  it('liste les entrées dans la période, triées par date', () => {
    const entries: GardenLogEntry[] = [
      { id: 'e1', type: 'arrosage', date: '2026-06-10', volumeLiters: 20, createdAt: 1 },
      { id: 'e2', type: 'recolte', date: '2026-06-05', quantityKg: 2, createdAt: 2 },
      { id: 'e3', type: 'semis', date: '2026-05-01', createdAt: 3 }, // hors période
    ]
    const att = buildJournalAttachment({ entries, refs: emptyRefs, from: '2026-06-01', to: '2026-06-30' })
    expect(att.kind).toBe('journal')
    expect(att.text).toContain('2026-06-05')
    expect(att.text).toContain('2026-06-10')
    expect(att.text).not.toContain('2026-05-01')
    expect(att.text.indexOf('2026-06-05')).toBeLessThan(att.text.indexOf('2026-06-10'))
  })

  it("indique l'absence d'entrée si la période est vide", () => {
    const att = buildJournalAttachment({ entries: [], refs: emptyRefs, from: '2026-06-01', to: '2026-06-30' })
    expect(att.text).toContain('aucune entrée')
  })
})

describe('buildCropAttachment', () => {
  it('assemble les infos de la culture et ses récoltes', () => {
    const crop: Crop = { id: 'c1', name: 'Tomate', status: 'en_recolte', plantCount: 6 }
    const variety: Variety = { id: 'v1', name: 'Saint-Pierre', vegetable: 'Tomate' }
    const parcel: Parcel = { id: 'p1', name: 'Carré nord' }
    const harvestRows: HarvestRow[] = [
      { cropId: 'c1', cropName: 'Tomate', year: 2026, totalKg: 5, pricePerKg: 3, totalEuros: 15 },
      { cropId: 'c2', cropName: 'Autre', year: 2026, totalKg: 1 },
    ]
    const att = buildCropAttachment({ crop, harvestRows, variety, parcel })
    expect(att.kind).toBe('culture')
    expect(att.text).toContain('Tomate')
    expect(att.text).toContain('Saint-Pierre')
    expect(att.text).toContain('Carré nord')
    expect(att.text).toContain('5 kg')
    expect(att.text).not.toContain('Autre')
  })
})

describe('buildSeasonAttachment', () => {
  it('résume les lignes par culture et par parcelle', () => {
    const cropRows: CropSeasonRow[] = [
      {
        cropId: 'c1',
        cropName: 'Tomate',
        varietyName: 'Saint-Pierre',
        year: 2026,
        totalKg: 5,
        expensesEuros: 2,
        netEuros: 13,
      },
    ]
    const parcelRows: ParcelSeasonRow[] = [
      {
        parcelId: 'p1',
        parcelName: 'Carré nord',
        year: 2026,
        totalKg: 5,
        expensesEuros: 2,
        netEuros: 13,
        totalWaterLiters: 100,
        totalRainLiters: 20,
      },
    ]
    const att = buildSeasonAttachment({ cropRows, parcelRows, year: 2026 })
    expect(att.text).toContain('Tomate')
    expect(att.text).toContain('Carré nord')
    expect(att.text).toContain('100 L arrosés')
  })

  it('signale une saison vide', () => {
    const att = buildSeasonAttachment({ cropRows: [], parcelRows: [], year: 2026 })
    expect(att.text).toContain('Rien à montrer')
  })
})

describe('buildExpensesAttachment', () => {
  it('liste les dépenses de l\'année avec le total', () => {
    const expenses: Expense[] = [
      { id: 'e1', label: 'Terreau', amountEuros: 12, date: '2026-03-01', amortization: 'consommable' },
      { id: 'e2', label: 'Graines', amountEuros: 8, date: '2026-04-01', amortization: 'consommable' },
      { id: 'e3', label: 'Vieille dépense', amountEuros: 100, date: '2025-01-01', amortization: 'consommable' },
    ]
    const att = buildExpensesAttachment({ expenses, year: 2026 })
    expect(att.text).toContain('Terreau')
    expect(att.text).toContain('Graines')
    expect(att.text).not.toContain('Vieille dépense')
    expect(att.text).toContain('20')
  })

  it('signale une absence de dépenses', () => {
    const att = buildExpensesAttachment({ expenses: [], year: 2026 })
    expect(att.text).toContain('aucune dépense')
  })
})
