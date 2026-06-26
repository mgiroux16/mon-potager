import { describe, it, expect } from 'vitest'
import { resolveRainMm } from './wateringComparisonService'
import type { GardenLogEntry } from '../data/model'
import type { DailyWeather } from './weatherService'

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
