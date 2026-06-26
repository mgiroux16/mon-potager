import { describe, it, expect } from 'vitest'
import { summarizeTankAutonomy } from './tankAutonomyService'
import type { GardenLogEntry, WaterTank } from '../data/model'

function entry(over: Partial<GardenLogEntry>): GardenLogEntry {
  return {
    type: 'arrosage',
    date: '2026-06-01',
    createdAt: Date.now(),
    ...over,
  }
}

function tank(over: Partial<WaterTank>): WaterTank {
  return { name: 'Cuve test', capacityLiters: 500, ...over }
}

describe('summarizeTankAutonomy', () => {
  it('somme la capacite et le niveau estime de toutes les cuves', () => {
    const tanks = [
      tank({ id: 1, capacityLiters: 500, estimatedLiters: 300 }),
      tank({ id: 2, capacityLiters: 500, estimatedLiters: 200 }),
    ]
    const result = summarizeTankAutonomy(tanks, [], '2026-06-21')
    expect(result.totalCapacityLiters).toBe(1000)
    expect(result.totalEstimatedLiters).toBe(500)
  })

  it('compte une cuve sans estimatedLiters comme 0', () => {
    const tanks = [tank({ id: 1, capacityLiters: 500 })]
    const result = summarizeTankAutonomy(tanks, [], '2026-06-21')
    expect(result.totalEstimatedLiters).toBe(0)
  })

  it('calcule la consommation moyenne sur 7 jours toutes parcelles confondues', () => {
    const tanks = [tank({ id: 1, estimatedLiters: 1000 })]
    const entries = [
      entry({ parcelId: 1, date: '2026-06-20', volumeLiters: 14 }), // dans la fenetre 7j
      entry({ parcelId: 2, date: '2026-06-18', volumeLiters: 7 }), // dans la fenetre 7j
      entry({ parcelId: 1, date: '2026-06-01', volumeLiters: 100 }), // hors fenetre
    ]
    const result = summarizeTankAutonomy(tanks, entries, '2026-06-21')
    expect(result.dailyAverageLiters).toBe(3) // (14 + 7) / 7
  })

  it('ignore les entrees sans volumeLiters ou hors type arrosage', () => {
    const tanks = [tank({ id: 1, estimatedLiters: 1000 })]
    const entries = [
      entry({ parcelId: 1, date: '2026-06-20', durationMinutes: 10 }),
      entry({ type: 'remplissage_oya', parcelId: 1, date: '2026-06-20', volumeLiters: 5 }),
    ]
    const result = summarizeTankAutonomy(tanks, entries, '2026-06-21')
    expect(result.dailyAverageLiters).toBe(0)
  })

  it('calcule autonomyDays comme totalEstimatedLiters / dailyAverageLiters, arrondi', () => {
    const tanks = [tank({ id: 1, estimatedLiters: 100 })]
    const entries = [entry({ parcelId: 1, date: '2026-06-20', volumeLiters: 21 })] // 3 L/j
    const result = summarizeTankAutonomy(tanks, entries, '2026-06-21')
    expect(result.dailyAverageLiters).toBe(3)
    expect(result.autonomyDays).toBe(33) // 100 / 3 = 33.33 -> 33
  })

  it('renvoie autonomyDays null quand la consommation moyenne est nulle', () => {
    const tanks = [tank({ id: 1, estimatedLiters: 1000 })]
    const result = summarizeTankAutonomy(tanks, [], '2026-06-21')
    expect(result.autonomyDays).toBeNull()
  })

  it('renvoie des totaux a 0 et autonomyDays null sans aucune cuve', () => {
    const result = summarizeTankAutonomy([], [], '2026-06-21')
    expect(result).toEqual({
      totalCapacityLiters: 0,
      totalEstimatedLiters: 0,
      dailyAverageLiters: 0,
      autonomyDays: null,
    })
  })
})
