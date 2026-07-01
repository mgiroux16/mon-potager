import { describe, it, expect } from 'vitest'
import { seasonBounds, summarizeCropSeason, summarizeParcelSeason } from './seasonSummaryService'
import { DEFAULT_SETTINGS } from './settingsService'
import type { GardenLogEntry, Crop, Variety, Parcel, Expense } from '../data/model'

describe('seasonBounds', () => {
  it('calcule les bornes de saison pour une annee donnee a partir des reglages', () => {
    const settings = { ...DEFAULT_SETTINGS, seasonStartMonth: 3, seasonEndMonth: 11 }
    const bounds = seasonBounds(2026, settings)
    expect(bounds).toEqual({ start: '2026-03-01', end: '2026-11-30' })
  })

  it('gere les mois a 31 jours et a 30 jours pour la borne de fin', () => {
    const settings = { ...DEFAULT_SETTINGS, seasonStartMonth: 4, seasonEndMonth: 9 }
    const bounds = seasonBounds(2025, settings)
    expect(bounds).toEqual({ start: '2025-04-01', end: '2025-09-30' })
  })

  it('gere fevrier sur une annee bissextile', () => {
    const settings = { ...DEFAULT_SETTINGS, seasonStartMonth: 1, seasonEndMonth: 2 }
    const bounds = seasonBounds(2024, settings)
    expect(bounds).toEqual({ start: '2024-01-01', end: '2024-02-29' })
  })
})

describe('summarizeCropSeason', () => {
  const settings = { ...DEFAULT_SETTINGS, seasonStartMonth: 3, seasonEndMonth: 11 }

  function entry(over: Partial<GardenLogEntry>): GardenLogEntry {
    return { type: 'recolte', date: '2026-06-01', createdAt: Date.now(), ...over }
  }

  it('agrege le total kg, le rendement par plant et par m2, et la valeur brute', () => {
    const crops: Crop[] = [
      { id: '1', name: 'Tomates', status: 'en_recolte', plantCount: 4, parcelId: '10', pricePerKg: 3 },
    ]
    const parcels: Parcel[] = [{ id: '10', name: 'Carre nord', areaM2: 8 }]
    const varieties: Variety[] = []
    const expenses: Expense[] = []
    const entries = [
      entry({ cropId: '1', date: '2026-06-01', quantityKg: 2 }),
      entry({ cropId: '1', date: '2026-07-01', quantityKg: 2 }),
    ]

    const rows = summarizeCropSeason(entries, crops, varieties, parcels, expenses, 2026, settings)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      cropId: '1',
      cropName: 'Tomates',
      varietyId: undefined,
      varietyName: 'non précisée',
      parcelId: '10',
      parcelName: 'Carre nord',
      totalKg: 4,
      yieldPerPlantKg: 1,
      yieldPerM2Kg: 0.5,
      grossValueEuros: 12,
      expensesEuros: 0,
      netEuros: 12,
      firstHarvestDate: '2026-06-01',
      lastHarvestDate: '2026-07-01',
    })
  })

  it('ignore les recoltes hors de la fenetre de saison', () => {
    const crops: Crop[] = [{ id: '1', name: 'Tomates', status: 'en_recolte' }]
    const entries = [
      entry({ cropId: '1', date: '2026-01-15', quantityKg: 1 }),
      entry({ cropId: '1', date: '2026-06-01', quantityKg: 2 }),
    ]
    const rows = summarizeCropSeason(entries, crops, [], [], [], 2026, settings)
    expect(rows[0].totalKg).toBe(2)
  })

  it('ne calcule pas yieldPerPlantKg si plantCount est absent', () => {
    const crops: Crop[] = [{ id: '1', name: 'Tomates', status: 'en_recolte' }]
    const entries = [entry({ cropId: '1', quantityKg: 2 })]
    const rows = summarizeCropSeason(entries, crops, [], [], [], 2026, settings)
    expect(rows[0].yieldPerPlantKg).toBeUndefined()
  })

  it('ne calcule pas yieldPerM2Kg si la parcelle n a pas de areaM2', () => {
    const crops: Crop[] = [{ id: '1', name: 'Tomates', status: 'en_recolte', parcelId: '10' }]
    const parcels: Parcel[] = [{ id: '10', name: 'Carre nord' }]
    const entries = [entry({ cropId: '1', quantityKg: 2 })]
    const rows = summarizeCropSeason(entries, crops, [], parcels, [], 2026, settings)
    expect(rows[0].yieldPerM2Kg).toBeUndefined()
  })

  it('separe deux varietes de la meme culture en deux lignes', () => {
    const crops: Crop[] = [{ id: '1', name: 'Tomates', status: 'en_recolte' }]
    const varieties: Variety[] = [
      { id: '100', name: 'Saint-Pierre', vegetable: 'Tomate' },
      { id: '101', name: 'Coeur de boeuf', vegetable: 'Tomate' },
    ]
    const entries = [
      entry({ cropId: '1', varietyId: '100', quantityKg: 2 }),
      entry({ cropId: '1', varietyId: '101', quantityKg: 3 }),
    ]
    const rows = summarizeCropSeason(entries, crops, varieties, [], [], 2026, settings)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.varietyName).sort()).toEqual(['Coeur de boeuf', 'Saint-Pierre'])
  })

  it('soustrait les depenses liees au cropId et dans la fenetre de saison', () => {
    const crops: Crop[] = [{ id: '1', name: 'Tomates', status: 'en_recolte', pricePerKg: 3 }]
    const expenses: Expense[] = [
      { id: '1', label: 'Terreau', amountEuros: 5, date: '2026-04-01', amortization: 'consommable', cropId: '1' },
      { id: '2', label: 'Hors saison', amountEuros: 99, date: '2026-01-01', amortization: 'consommable', cropId: '1' },
      { id: '3', label: 'Autre culture', amountEuros: 50, date: '2026-04-01', amortization: 'consommable', cropId: '2' },
    ]
    const entries = [entry({ cropId: '1', quantityKg: 2 })]
    const rows = summarizeCropSeason(entries, crops, [], [], expenses, 2026, settings)
    expect(rows[0].expensesEuros).toBe(5)
    expect(rows[0].netEuros).toBe(1)
  })

  it('cree une ligne depense seule si une culture a des depenses mais aucune recolte', () => {
    const crops: Crop[] = [{ id: '1', name: 'Tomates', status: 'en_place' }]
    const expenses: Expense[] = [
      { id: '1', label: 'Terreau', amountEuros: 5, date: '2026-04-01', amortization: 'consommable', cropId: '1' },
    ]
    const rows = summarizeCropSeason([], crops, [], [], expenses, 2026, settings)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      totalKg: 0,
      expensesEuros: 5,
      grossValueEuros: undefined,
      netEuros: undefined,
    })
  })
})

describe('summarizeParcelSeason', () => {
  const settings = { ...DEFAULT_SETTINGS, seasonStartMonth: 3, seasonEndMonth: 11 }

  function entry(over: Partial<GardenLogEntry>): GardenLogEntry {
    return { type: 'recolte', date: '2026-06-01', createdAt: Date.now(), ...over }
  }

  it('agrege le total kg toutes cultures confondues sur une parcelle', () => {
    const parcels: Parcel[] = [{ id: '10', name: 'Carre nord', areaM2: 8 }]
    const crops: Crop[] = [
      { id: '1', name: 'Tomates', status: 'en_recolte', parcelId: '10', pricePerKg: 3 },
      { id: '2', name: 'Courgettes', status: 'en_recolte', parcelId: '10', pricePerKg: 1 },
    ]
    const entries = [
      entry({ cropId: '1', parcelId: '10', quantityKg: 2 }),
      entry({ cropId: '2', parcelId: '10', quantityKg: 4 }),
    ]
    const rows = summarizeParcelSeason(entries, parcels, crops, [], 2026, settings)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      parcelId: '10',
      parcelName: 'Carre nord',
      totalKg: 6,
      yieldPerM2Kg: 0.75,
      grossValueEuros: 10,
    })
  })

  it('additionne les litres arroses dans la fenetre de saison', () => {
    const parcels: Parcel[] = [{ id: '10', name: 'Carre nord' }]
    const entries = [
      entry({ type: 'arrosage', parcelId: '10', date: '2026-04-01', volumeLiters: 20 }),
      entry({ type: 'arrosage', parcelId: '10', date: '2026-12-15', volumeLiters: 99 }),
    ]
    const rows = summarizeParcelSeason(entries, parcels, [], [], 2026, settings)
    expect(rows[0].totalWaterLiters).toBe(20)
  })

  it('repartit egalement les litres d une entree arrosage multi-parcelles entre les parcelles jointes', () => {
    const parcels: Parcel[] = [
      { id: '10', name: 'Carre nord' },
      { id: '11', name: 'Carre sud' },
    ]
    const entries = [
      entry({ type: 'arrosage', parcelIds: ['10', '11'], date: '2026-04-01', volumeLiters: 20 }),
    ]
    const rows = summarizeParcelSeason(entries, parcels, [], [], 2026, settings)
    expect(rows.find((r) => r.parcelId === '10')?.totalWaterLiters).toBe(10)
    expect(rows.find((r) => r.parcelId === '11')?.totalWaterLiters).toBe(10)
  })

  it('additionne la pluie a partir des releves manuels convertis en litres via areaM2', () => {
    const parcels: Parcel[] = [{ id: '10', name: 'Carre nord', areaM2: 10 }]
    const entries = [
      entry({ type: 'releve_pluie', parcelId: '10', date: '2026-05-01', rainMm: 4 }),
      entry({ type: 'releve_pluie', parcelId: '10', date: '2026-05-02', rainMm: 2 }),
    ]
    const rows = summarizeParcelSeason(entries, parcels, [], [], 2026, settings)
    expect(rows[0].totalRainLiters).toBe(60)
  })

  it('renvoie aucune ligne sans aucune entree', () => {
    const parcels: Parcel[] = [{ id: '10', name: 'Carre nord', areaM2: 10 }]
    const rows = summarizeParcelSeason([], parcels, [], [], 2026, settings)
    expect(rows).toHaveLength(0)
  })

  it('soustrait les depenses liees au parcelId dans la fenetre de saison', () => {
    const parcels: Parcel[] = [{ id: '10', name: 'Carre nord' }]
    const crops: Crop[] = [{ id: '1', name: 'Tomates', status: 'en_recolte', parcelId: '10', pricePerKg: 3 }]
    const expenses: Expense[] = [
      { id: '1', label: 'Paillage', amountEuros: 7, date: '2026-04-01', amortization: 'consommable', parcelId: '10' },
    ]
    const entries = [entry({ cropId: '1', parcelId: '10', quantityKg: 2 })]
    const rows = summarizeParcelSeason(entries, parcels, crops, expenses, 2026, settings)
    expect(rows[0].expensesEuros).toBe(7)
    expect(rows[0].netEuros).toBe(-1)
  })
})
