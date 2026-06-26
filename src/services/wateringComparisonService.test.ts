import { describe, it, expect } from 'vitest'
import { resolveRainMm, compareWateringToRain } from './wateringComparisonService'
import type { GardenLogEntry, Parcel } from '../data/model'
import type { DailyWeather } from './weatherService'
import type { WaterUsageRow } from './waterUsageService'

function entry(over: Partial<GardenLogEntry>): GardenLogEntry {
  return { type: 'releve_pluie', date: '2026-06-01', createdAt: Date.now(), ...over }
}

function day(date: string, rainMm: number): DailyWeather {
  return { date, tempMaxC: 20, tempMinC: 10, rainMm }
}

describe('resolveRainMm', () => {
  it('utilise les releves manuels quand au moins un existe dans la fenetre', () => {
    const entries = [
      entry({ date: '2026-06-20', rainMm: 4 }),
      entry({ date: '2026-06-19', rainMm: 2 }),
    ]
    const history = [day('2026-06-20', 100), day('2026-06-19', 100)] // jamais utilise ici
    const result = resolveRainMm(entries, history, '2026-06-21', 7)
    expect(result).toBe(6)
  })

  it('retombe sur l historique API si aucun releve manuel dans la fenetre', () => {
    const entries = [entry({ date: '2026-01-01', rainMm: 50 })] // hors fenetre
    const history = [day('2026-06-20', 3), day('2026-06-19', 1)]
    const result = resolveRainMm(entries, history, '2026-06-21', 7)
    expect(result).toBe(4)
  })

  it('renvoie 0 si aucun releve manuel et historique indisponible (hors-ligne)', () => {
    const entries: GardenLogEntry[] = []
    const result = resolveRainMm(entries, null, '2026-06-21', 7)
    expect(result).toBe(0)
  })

  it('ignore les entrees releve_pluie hors fenetre et les entrees d un autre type', () => {
    const entries = [
      entry({ date: '2026-05-01', rainMm: 9 }), // hors fenetre 7j
      entry({ type: 'arrosage', date: '2026-06-20', rainMm: 9 }), // mauvais type, ignore
    ]
    const history = [day('2026-06-20', 5)]
    const result = resolveRainMm(entries, history, '2026-06-21', 7)
    expect(result).toBe(5)
  })

  it('filtre l historique a la fenetre demandee', () => {
    const entries: GardenLogEntry[] = []
    const history = [day('2026-06-20', 3), day('2026-05-01', 100)] // hors fenetre 7j
    const result = resolveRainMm(entries, history, '2026-06-21', 7)
    expect(result).toBe(3)
  })
})

function usageRow(over: Partial<WaterUsageRow>): WaterUsageRow {
  return {
    parcelId: 1,
    parcelName: 'Carrés du fond',
    liters7: 0,
    liters14: 0,
    liters30: 0,
    litersYear: 0,
    ...over,
  }
}

function parcel(over: Partial<Parcel>): Parcel {
  return { name: 'Carrés du fond', ...over }
}

describe('compareWateringToRain', () => {
  it('convertit la pluie en litres via la surface de la parcelle', () => {
    const usage = [usageRow({ parcelId: 1, liters7: 10, liters14: 20, liters30: 30 })]
    const parcels = [parcel({ id: 1, areaM2: 5 })]
    const result = compareWateringToRain(usage, parcels, 2, 4, 6)
    expect(result[0]).toMatchObject({
      parcelId: 1,
      liters7: 10,
      rainLiters7: 10, // 2mm * 5m2
      totalLiters7: 20,
      liters14: 20,
      rainLiters14: 20, // 4mm * 5m2
      totalLiters14: 40,
      liters30: 30,
      rainLiters30: 30, // 6mm * 5m2
      totalLiters30: 60,
    })
  })

  it('renvoie rainLiters null et total = litersGiven si areaM2 absent', () => {
    const usage = [usageRow({ parcelId: 1, liters7: 10 })]
    const parcels = [parcel({ id: 1, areaM2: undefined })]
    const result = compareWateringToRain(usage, parcels, 2, 4, 6)
    expect(result[0].rainLiters7).toBeNull()
    expect(result[0].totalLiters7).toBe(10)
  })

  it('combine plusieurs parcelles avec la meme pluie ponderee par surface', () => {
    const usage = [
      usageRow({ parcelId: 1, parcelName: 'Carrés du fond', liters7: 10 }),
      usageRow({ parcelId: 2, parcelName: 'Allée', liters7: 5 }),
    ]
    const parcels = [
      parcel({ id: 1, name: 'Carrés du fond', areaM2: 2 }),
      parcel({ id: 2, name: 'Allée', areaM2: 4 }),
    ]
    const result = compareWateringToRain(usage, parcels, 3, 0, 0)
    expect(result.find((r) => r.parcelId === 1)?.rainLiters7).toBe(6) // 3mm * 2m2
    expect(result.find((r) => r.parcelId === 2)?.rainLiters7).toBe(12) // 3mm * 4m2
  })

  it('ignore une ligne usage dont la parcelle n existe plus', () => {
    const usage = [usageRow({ parcelId: 99, liters7: 10 })]
    const parcels: Parcel[] = []
    const result = compareWateringToRain(usage, parcels, 2, 0, 0)
    expect(result[0].rainLiters7).toBeNull()
    expect(result[0].totalLiters7).toBe(10)
  })
})
