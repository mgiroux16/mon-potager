import { describe, it, expect } from 'vitest'
import { buildDedupePlan } from './dedupeService'
import type { Crop, Diagnostic, GardenLogEntry, Parcel } from '../data/model'

function plan(input: {
  parcels?: Parcel[]
  crops?: Crop[]
  log?: GardenLogEntry[]
  diagnostics?: Diagnostic[]
}) {
  return buildDedupePlan(input.parcels ?? [], input.crops ?? [], input.log ?? [], input.diagnostics ?? [])
}

describe('buildDedupePlan', () => {
  it('fusionne deux parcelles de meme nom, garde la plus ancienne, reattribue le journal', () => {
    const p = plan({
      parcels: [
        { id: 'p-old', name: 'Buttes courges', areaM2: 30, updatedAt: 100 } as Parcel,
        { id: 'p-new', name: 'Buttes courges', areaM2: 30, updatedAt: 200 } as Parcel,
      ],
      log: [{ id: 'e1', type: 'observation', date: '2026-06-24', parcelId: 'p-new', createdAt: 1 } as GardenLogEntry],
    })

    expect(p.parcelIdMap.size).toBe(1)
    expect(p.parcelIdMap.get('p-new')).toBe('p-old')
    expect(p.ops).toContainEqual({ type: 'set', table: 'log', id: 'e1', data: { parcelId: 'p-old' } })
    expect(p.ops).toContainEqual({ type: 'delete', table: 'parcels', id: 'p-new' })
  })

  it('preserve un arrosage multi-parcelles (parcelIds) lors de la fusion', () => {
    const p = plan({
      parcels: [
        { id: 'p-old', name: 'Aromatiques et alliacées', updatedAt: 100 } as Parcel,
        { id: 'p-new', name: 'Aromatiques et alliacées', updatedAt: 200 } as Parcel,
        { id: 'p-autre', name: 'Autre parcelle', updatedAt: 50 } as Parcel,
      ],
      log: [{ id: 'e1', type: 'arrosage', date: '2026-06-24', parcelIds: ['p-new', 'p-autre'], createdAt: 1 } as GardenLogEntry],
    })

    expect(p.ops).toContainEqual({
      type: 'set', table: 'log', id: 'e1', data: { parcelIds: ['p-old', 'p-autre'] },
    })
  })

  it('prefere le nom sans "(copie)" comme exemplaire conserve', () => {
    const p = plan({
      parcels: [
        { id: 'p-copie', name: 'ail rose (copie)', updatedAt: 50 } as Parcel,
        { id: 'p-original', name: 'ail rose', updatedAt: 300 } as Parcel,
      ],
    })

    expect(p.parcelIdMap.get('p-copie')).toBe('p-original')
    expect(p.ops).toContainEqual({ type: 'delete', table: 'parcels', id: 'p-copie' })
  })

  it('fusionne des cultures en doublon (meme nom, meme parcelle) et reattribue une recolte', () => {
    const p = plan({
      crops: [
        { id: 'c-old', name: 'Oignon', status: 'en_place', parcelId: 'p1', updatedAt: 100 } as Crop,
        { id: 'c-new', name: 'Oignon', status: 'en_place', parcelId: 'p1', updatedAt: 200 } as Crop,
      ],
      log: [{ id: 'e1', type: 'recolte', date: '2026-06-24', cropId: 'c-new', quantityKg: 2, createdAt: 1 } as GardenLogEntry],
    })

    expect(p.cropIdMap.get('c-new')).toBe('c-old')
    expect(p.ops).toContainEqual({ type: 'set', table: 'log', id: 'e1', data: { cropId: 'c-old' } })
    expect(p.ops).toContainEqual({ type: 'delete', table: 'crops', id: 'c-new' })
  })

  it('ne fusionne PAS deux cultures de meme nom sur des parcelles differentes', () => {
    const p = plan({
      crops: [
        { id: 'c1', name: 'Tomates', status: 'en_place', parcelId: 'p1', updatedAt: 100 } as Crop,
        { id: 'c2', name: 'Tomates', status: 'en_place', parcelId: 'p2', updatedAt: 200 } as Crop,
      ],
    })

    expect(p.cropIdMap.size).toBe(0)
    expect(p.ops).toHaveLength(0)
  })

  it('fusionne deux cultures de meme nom quand leurs parcelles fusionnent aussi', () => {
    const p = plan({
      parcels: [
        { id: 'p-old', name: 'Buttes courges', updatedAt: 100 } as Parcel,
        { id: 'p-new', name: 'Buttes courges', updatedAt: 200 } as Parcel,
      ],
      crops: [
        { id: 'c1', name: 'Courges', status: 'en_place', parcelId: 'p-old', updatedAt: 100 } as Crop,
        { id: 'c2', name: 'Courges', status: 'en_place', parcelId: 'p-new', updatedAt: 200 } as Crop,
      ],
    })

    expect(p.cropIdMap.get('c2')).toBe('c1')
    expect(p.ops).toContainEqual({ type: 'delete', table: 'crops', id: 'c2' })
  })

  it('ne touche pas des parcelles/cultures au nom different', () => {
    const p = plan({
      parcels: [
        { id: 'p1', name: 'Planche tomates', updatedAt: 100 } as Parcel,
        { id: 'p2', name: 'Rang pommes de terre', updatedAt: 200 } as Parcel,
      ],
      crops: [{ id: 'c1', name: 'Tomates', status: 'en_place', updatedAt: 100 } as Crop],
    })

    expect(p.parcelIdMap.size).toBe(0)
    expect(p.cropIdMap.size).toBe(0)
    expect(p.ops).toHaveLength(0)
  })

  it('reattribue le parcelId d une culture conservee qui pointait sur une parcelle fusionnee', () => {
    const p = plan({
      parcels: [
        { id: 'p-old', name: 'Buttes courges', updatedAt: 100 } as Parcel,
        { id: 'p-new', name: 'Buttes courges', updatedAt: 200 } as Parcel,
      ],
      crops: [{ id: 'c1', name: 'Courges', status: 'en_place', parcelId: 'p-new', updatedAt: 100 } as Crop],
    })

    expect(p.ops).toContainEqual({ type: 'set', table: 'crops', id: 'c1', data: { parcelId: 'p-old' } })
  })

  it('reattribue les references des diagnostics', () => {
    const p = plan({
      parcels: [
        { id: 'p-old', name: 'Buttes courges', updatedAt: 100 } as Parcel,
        { id: 'p-new', name: 'Buttes courges', updatedAt: 200 } as Parcel,
      ],
      diagnostics: [{ id: 'd1', parcelId: 'p-new' } as Diagnostic],
    })

    expect(p.ops).toContainEqual({ type: 'set', table: 'diagnostics', id: 'd1', data: { parcelId: 'p-old' } })
  })

  it('ignore les tombstones (deletedAt) dans la detection des doublons', () => {
    const p = plan({
      parcels: [
        { id: 'p1', name: 'Buttes courges', updatedAt: 100 } as Parcel,
        { id: 'p2', name: 'Buttes courges', updatedAt: 200, deletedAt: 300 } as Parcel,
      ],
    })

    expect(p.parcelIdMap.size).toBe(0)
    expect(p.ops).toHaveLength(0)
  })
})
