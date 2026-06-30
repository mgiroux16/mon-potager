import { describe, it, expect } from 'vitest'
import { getTodayAgenda } from './todayAgendaService'
import type { TodayAgendaInput } from './todayAgendaService'
import type { Parcel, Crop, WaterTank, GardenLogEntry, CatalogItem } from '../data/model'

const TODAY = '2026-06-30'

function makeInput(over: Partial<TodayAgendaInput> = {}): TodayAgendaInput {
  return {
    parcels: [],
    crops: [],
    catalog: [],
    tanks: [],
    log: [],
    today: TODAY,
    ...over,
  }
}

function parcel(id: string, name = `Parcelle ${id}`): Parcel {
  return { id, name }
}

function crop(id: string, parcelId: string, status: Crop['status'] = 'en_place', opts: Partial<Crop> = {}): Crop {
  return { id, name: `Culture ${id}`, parcelId, status, ...opts }
}

function tank(id: string, capacityLiters: number, estimatedLiters: number): WaterTank {
  return { id, name: `Cuve ${id}`, capacityLiters, estimatedLiters }
}

function logEntry(over: Partial<GardenLogEntry>): GardenLogEntry {
  return { type: 'observation', date: TODAY, createdAt: Date.now(), ...over }
}

function catalogItem(id: string, vegetable: string, opts: Partial<CatalogItem> = {}): CatalogItem {
  return { id, vegetable, family: 'solanacees', ...opts }
}

// — Test 1 : rien à faire (jardin vide, météo OK)
describe('getTodayAgenda', () => {
  it('retourne une liste vide si rien ne déclenche', () => {
    const result = getTodayAgenda(makeInput({
      weatherHistory: [{ date: TODAY, tempMaxC: 22, tempMinC: 12, rainMm: 10 }],
      todayTempMinC: 12,
    }))
    expect(result).toHaveLength(0)
  })

  // — Test 2 : alerte gel
  it('déclenche alerte_gel si tempMinC < 2', () => {
    const result = getTodayAgenda(makeInput({ todayTempMinC: 0 }))
    expect(result.some((i) => i.kind === 'alerte_gel')).toBe(true)
    expect(result.find((i) => i.kind === 'alerte_gel')?.priority).toBe(1)
  })

  // — Test 3 : cuve basse (autonomy ≤ 3 j)
  it('déclenche cuve_basse si autonomie ≤ 3 jours', () => {
    const tanks = [tank('t1', 200, 6)]
    const arrosages = [
      logEntry({ type: 'arrosage', date: '2026-06-29', volumeLiters: 3, parcelId: 'p1' }),
      logEntry({ type: 'arrosage', date: '2026-06-28', volumeLiters: 3, parcelId: 'p1' }),
      logEntry({ type: 'arrosage', date: '2026-06-27', volumeLiters: 3, parcelId: 'p1' }),
      logEntry({ type: 'arrosage', date: '2026-06-26', volumeLiters: 3, parcelId: 'p1' }),
      logEntry({ type: 'arrosage', date: '2026-06-25', volumeLiters: 3, parcelId: 'p1' }),
      logEntry({ type: 'arrosage', date: '2026-06-24', volumeLiters: 3, parcelId: 'p1' }),
      logEntry({ type: 'arrosage', date: '2026-06-23', volumeLiters: 3, parcelId: 'p1' }),
    ]
    // 21 L sur 7 j = 3 L/j → 6 L restants → 2 j d'autonomie
    const result = getTodayAgenda(makeInput({ tanks, log: arrosages }))
    expect(result.some((i) => i.kind === 'cuve_basse')).toBe(true)
  })

  // — Test 4 : arrosage conseillé (aucun log, pluie 0)
  it('conseille arrosage si pluie 2 j < 3 mm et aucun arrosage récent', () => {
    const parcels = [parcel('p1', 'Tomates')]
    const crops = [crop('c1', 'p1')]
    const result = getTodayAgenda(makeInput({
      parcels,
      crops,
      weatherHistory: [{ date: TODAY, tempMaxC: 25, tempMinC: 14, rainMm: 0 }],
    }))
    expect(result.some((i) => i.kind === 'arrosage')).toBe(true)
  })

  // — Test 5 : pas d'arrosage si pluie récente suffisante
  it('ne conseille pas arrosage si pluie cumulée 2 j ≥ 3 mm', () => {
    const parcels = [parcel('p1', 'Tomates')]
    const crops = [crop('c1', 'p1')]
    const result = getTodayAgenda(makeInput({
      parcels,
      crops,
      weatherHistory: [
        { date: '2026-06-29', tempMaxC: 20, tempMinC: 14, rainMm: 5 },
        { date: TODAY, tempMaxC: 22, tempMinC: 12, rainMm: 0 },
      ],
    }))
    expect(result.some((i) => i.kind === 'arrosage')).toBe(false)
  })

  // — Test 6 : récolte prête
  it('déclenche recolte si culture dépasse daysToHarvest', () => {
    const cat = [catalogItem('cat1', 'Radis', { sowingMonths: [4], daysToHarvest: 30 })]
    const crops = [crop('c1', 'p1', 'en_place', { catalogId: 'cat1' })]
    const log = [
      logEntry({ type: 'semis', date: '2026-05-01', cropId: 'c1' }),
    ]
    // 30 j depuis le 01/05 → mûr le 31/05 → on est le 30/06 → OK
    const result = getTodayAgenda(makeInput({ parcels: [parcel('p1')], crops, catalog: cat, log }))
    expect(result.some((i) => i.kind === 'recolte')).toBe(true)
  })

  // — Test 7 : hors-ligne (météo absente) → items gel/arrosage omis, sans erreur
  it('omet gel et arrosage si météo absente (hors-ligne), sans erreur', () => {
    const parcels = [parcel('p1', 'Tomates')]
    const crops = [crop('c1', 'p1')]
    // weatherHistory absent (undefined) et todayTempMinC absent
    const result = getTodayAgenda(makeInput({ parcels, crops }))
    expect(result.some((i) => i.kind === 'alerte_gel')).toBe(false)
    expect(result.some((i) => i.kind === 'arrosage')).toBe(false)
  })
})
