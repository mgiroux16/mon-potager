import { describe, it, expect } from 'vitest'
import { getInactiveParcels, getHarvestReminders, getRotationReminders } from './reminderService'
import type { Parcel, GardenLogEntry, Crop, CatalogItem } from '../data/model'

function entry(over: Partial<GardenLogEntry>): GardenLogEntry {
  return { type: 'observation', date: '2026-06-01', createdAt: Date.now(), ...over }
}

describe('getInactiveParcels', () => {
  const parcels: Parcel[] = [
    { id: 1, name: 'Carré nord' },
    { id: 2, name: 'Carré sud' },
    { id: 3, name: 'Carré jamais touché' },
  ]

  it('exclut une parcelle avec une entree recente', () => {
    const log = [entry({ parcelId: 1, date: '2026-06-20' })]
    const result = getInactiveParcels(parcels, log, '2026-06-27')
    expect(result.find((r) => r.parcel.id === 1)).toBeUndefined()
  })

  it('inclut une parcelle dont la derniere entree depasse le seuil', () => {
    const log = [entry({ parcelId: 2, date: '2026-05-01' })]
    const result = getInactiveParcels(parcels, log, '2026-06-27')
    const match = result.find((r) => r.parcel.id === 2)
    expect(match?.daysSinceLastEntry).toBe(57)
  })

  it('inclut une parcelle sans aucune entree avec daysSinceLastEntry null', () => {
    const result = getInactiveParcels(parcels, [], '2026-06-27')
    const match = result.find((r) => r.parcel.id === 3)
    expect(match?.daysSinceLastEntry).toBeNull()
  })

  it('respecte un seuil personnalise', () => {
    const log = [entry({ parcelId: 1, date: '2026-06-20' })]
    const result = getInactiveParcels(parcels, log, '2026-06-27', 5)
    expect(result.find((r) => r.parcel.id === 1)).toBeDefined()
  })
})

describe('getHarvestReminders', () => {
  const catalog: CatalogItem[] = [
    { id: 1, vegetable: 'Radis', family: 'autres', sowingMonths: [3, 4], daysToHarvest: 28 },
    { id: 2, vegetable: 'Pomme de terre', family: 'solanacees', plantingMonths: [3], daysToHarvest: 100 },
    { id: 3, vegetable: 'Sans seuil', family: 'autres' },
  ]

  it('inclut une culture semee depuis plus longtemps que daysToHarvest', () => {
    const crops: Crop[] = [{ id: 10, name: 'Radis', status: 'en_place', catalogId: 1 }]
    const log = [entry({ type: 'semis', cropId: 10, date: '2026-05-01' })]
    const result = getHarvestReminders(crops, catalog, log, '2026-06-01')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ vegetable: 'Radis', referenceKind: 'semis', daysSinceReference: 31 })
  })

  it('exclut une culture semee trop recemment', () => {
    const crops: Crop[] = [{ id: 10, name: 'Radis', status: 'en_place', catalogId: 1 }]
    const log = [entry({ type: 'semis', cropId: 10, date: '2026-05-30' })]
    const result = getHarvestReminders(crops, catalog, log, '2026-06-01')
    expect(result).toHaveLength(0)
  })

  it('utilise la plantation comme reference quand le catalogue n a pas de sowingMonths', () => {
    const crops: Crop[] = [{ id: 11, name: 'Pommes de terre', status: 'en_place', catalogId: 2 }]
    const log = [entry({ type: 'plantation', cropId: 11, date: '2026-01-01' })]
    const result = getHarvestReminders(crops, catalog, log, '2026-06-01')
    expect(result).toHaveLength(1)
    expect(result[0].referenceKind).toBe('plantation')
  })

  it('exclut une culture sans catalogId ou sans daysToHarvest', () => {
    const crops: Crop[] = [
      { id: 12, name: 'Sans catalogue', status: 'en_place' },
      { id: 13, name: 'Sans seuil', status: 'en_place', catalogId: 3 },
    ]
    const log = [
      entry({ type: 'semis', cropId: 12, date: '2026-01-01' }),
      entry({ type: 'semis', cropId: 13, date: '2026-01-01' }),
    ]
    const result = getHarvestReminders(crops, catalog, log, '2026-06-01')
    expect(result).toHaveLength(0)
  })

  it('exclut une culture deja recoltee', () => {
    const crops: Crop[] = [{ id: 10, name: 'Radis', status: 'en_recolte', catalogId: 1 }]
    const log = [
      entry({ type: 'semis', cropId: 10, date: '2026-05-01' }),
      entry({ type: 'recolte', cropId: 10, date: '2026-06-01' }),
    ]
    const result = getHarvestReminders(crops, catalog, log, '2026-06-10')
    expect(result).toHaveLength(0)
  })

  it('ignore une culture sans entree semis ni plantation', () => {
    const crops: Crop[] = [{ id: 10, name: 'Radis', status: 'en_place', catalogId: 1 }]
    const result = getHarvestReminders(crops, catalog, [], '2026-06-01')
    expect(result).toHaveLength(0)
  })
})

describe('getRotationReminders', () => {
  const catalog: CatalogItem[] = [
    { id: 1, vegetable: 'Tomate', family: 'solanacees' },
    { id: 2, vegetable: 'Poivron', family: 'solanacees' },
    { id: 3, vegetable: 'Courgette', family: 'cucurbitacees' },
    { id: 4, vegetable: 'Radis', family: 'autres' },
  ]
  const parcels: Parcel[] = [
    { id: 1, name: 'Carré nord' },
    { id: 2, name: 'Carré sud' },
  ]

  it('alerte quand la meme famille revient sur la meme parcelle deux annees de suite', () => {
    const crops: Crop[] = [
      { id: 10, name: 'Tomate 2025', status: 'termine', parcelId: 1, catalogId: 1, plantingDate: '2025-04-01' },
      { id: 11, name: 'Poivron 2026', status: 'prevu', parcelId: 1, catalogId: 2, plantingDate: '2026-04-01' },
    ]
    const result = getRotationReminders(parcels, crops, catalog, '2026-06-27')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ family: 'solanacees', crop: crops[1] })
    expect(result[0].parcel.id).toBe(1)
  })

  it('pas d alerte quand les familles different', () => {
    const crops: Crop[] = [
      { id: 10, name: 'Tomate 2025', status: 'termine', parcelId: 1, catalogId: 1, plantingDate: '2025-04-01' },
      { id: 11, name: 'Courgette 2026', status: 'prevu', parcelId: 1, catalogId: 3, plantingDate: '2026-04-01' },
    ]
    const result = getRotationReminders(parcels, crops, catalog, '2026-06-27')
    expect(result).toHaveLength(0)
  })

  it('exclut la famille autres meme si elle revient deux annees de suite', () => {
    const crops: Crop[] = [
      { id: 10, name: 'Radis 2025', status: 'termine', parcelId: 1, catalogId: 4, plantingDate: '2025-04-01' },
      { id: 11, name: 'Radis 2026', status: 'prevu', parcelId: 1, catalogId: 4, plantingDate: '2026-04-01' },
    ]
    const result = getRotationReminders(parcels, crops, catalog, '2026-06-27')
    expect(result).toHaveLength(0)
  })

  it('ignore un crop sans sowingDate ni plantingDate', () => {
    const crops: Crop[] = [
      { id: 10, name: 'Tomate 2025', status: 'termine', parcelId: 1, catalogId: 1, plantingDate: '2025-04-01' },
      { id: 11, name: 'Poivron sans date', status: 'prevu', parcelId: 1, catalogId: 2 },
    ]
    const result = getRotationReminders(parcels, crops, catalog, '2026-06-27')
    expect(result).toHaveLength(0)
  })

  it('ignore un crop sans catalogId', () => {
    const crops: Crop[] = [
      { id: 10, name: 'Tomate 2025', status: 'termine', parcelId: 1, catalogId: 1, plantingDate: '2025-04-01' },
      { id: 11, name: 'Sans catalogue', status: 'prevu', parcelId: 1, plantingDate: '2026-04-01' },
    ]
    const result = getRotationReminders(parcels, crops, catalog, '2026-06-27')
    expect(result).toHaveLength(0)
  })

  it('pas d alerte si la meme famille est sur des parcelles differentes', () => {
    const crops: Crop[] = [
      { id: 10, name: 'Tomate 2025', status: 'termine', parcelId: 1, catalogId: 1, plantingDate: '2025-04-01' },
      { id: 11, name: 'Poivron 2026', status: 'prevu', parcelId: 2, catalogId: 2, plantingDate: '2026-04-01' },
    ]
    const result = getRotationReminders(parcels, crops, catalog, '2026-06-27')
    expect(result).toHaveLength(0)
  })

  it('alerte meme si le crop de cette annee est seulement prevu', () => {
    const crops: Crop[] = [
      { id: 10, name: 'Tomate 2025', status: 'termine', parcelId: 1, catalogId: 1, plantingDate: '2025-04-01' },
      { id: 11, name: 'Poivron 2026', status: 'prevu', parcelId: 1, catalogId: 2, sowingDate: '2026-03-01' },
    ]
    const result = getRotationReminders(parcels, crops, catalog, '2026-06-27')
    expect(result).toHaveLength(1)
  })
})
