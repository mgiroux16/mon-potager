import { describe, it, expect, beforeEach } from 'vitest'
import { db, newId } from '../data/db'
import { dedupeGardenData } from './dedupeService'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('dedupeGardenData', () => {
  it('fusionne deux parcelles de meme nom, garde la plus ancienne, reattribue le journal', async () => {
    await db.parcels.add({ id: 'p-old', name: 'Buttes courges', areaM2: 30, updatedAt: 100 })
    await db.parcels.add({ id: 'p-new', name: 'Buttes courges', areaM2: 30, updatedAt: 200 })
    await db.log.add({
      id: newId(), type: 'observation', date: '2026-06-24', parcelId: 'p-new', createdAt: Date.now(),
    })

    const summary = await dedupeGardenData()
    expect(summary.parcelsMerged).toBe(1)

    const parcels = await db.parcels.toArray()
    expect(parcels).toHaveLength(1)
    expect(parcels[0].id).toBe('p-old')

    const entry = (await db.log.toArray())[0]
    expect(entry.parcelId).toBe('p-old')
  })

  it('preserve un arrosage multi-parcelles (parcelIds) lors de la fusion', async () => {
    await db.parcels.add({ id: 'p-old', name: 'Aromatiques et alliacées', updatedAt: 100 })
    await db.parcels.add({ id: 'p-new', name: 'Aromatiques et alliacées', updatedAt: 200 })
    await db.parcels.add({ id: 'p-autre', name: 'Autre parcelle', updatedAt: 50 })
    await db.log.add({
      id: newId(), type: 'arrosage', date: '2026-06-24',
      parcelIds: ['p-new', 'p-autre'], createdAt: Date.now(),
    })

    await dedupeGardenData()

    const entry = (await db.log.toArray())[0]
    expect(entry.parcelIds).toEqual(['p-old', 'p-autre'])
  })

  it('prefere le nom sans "(copie)" comme exemplaire conserve', async () => {
    await db.parcels.add({ id: 'p-copie', name: 'ail rose (copie)', updatedAt: 50 })
    await db.parcels.add({ id: 'p-original', name: 'ail rose', updatedAt: 300 })

    await dedupeGardenData()

    const parcels = await db.parcels.toArray()
    expect(parcels).toHaveLength(1)
    expect(parcels[0].id).toBe('p-original')
  })

  it('fusionne des cultures en doublon et reattribue une recolte du journal', async () => {
    await db.crops.add({ id: 'c-old', name: 'Oignon', status: 'en_place', updatedAt: 100 })
    await db.crops.add({ id: 'c-new', name: 'Oignon', status: 'en_place', updatedAt: 200 })
    await db.log.add({
      id: newId(), type: 'recolte', date: '2026-06-24', cropId: 'c-new', quantityKg: 2, createdAt: Date.now(),
    })

    const summary = await dedupeGardenData()
    expect(summary.cropsMerged).toBe(1)

    const crops = await db.crops.toArray()
    expect(crops).toHaveLength(1)
    expect(crops[0].id).toBe('c-old')

    const entry = (await db.log.toArray())[0]
    expect(entry.cropId).toBe('c-old')
  })

  it("ne touche pas des parcelles/cultures au nom different", async () => {
    await db.parcels.add({ id: 'p1', name: 'Planche tomates', updatedAt: 100 })
    await db.parcels.add({ id: 'p2', name: 'Rang pommes de terre', updatedAt: 200 })
    await db.crops.add({ id: 'c1', name: 'Tomates', status: 'en_place', updatedAt: 100 })

    const summary = await dedupeGardenData()

    expect(summary).toEqual({ parcelsMerged: 0, cropsMerged: 0 })
    expect(await db.parcels.toArray()).toHaveLength(2)
    expect(await db.crops.toArray()).toHaveLength(1)
  })

  it('reattribue le parcelId d une culture qui pointait sur une parcelle fusionnee', async () => {
    await db.parcels.add({ id: 'p-old', name: 'Buttes courges', updatedAt: 100 })
    await db.parcels.add({ id: 'p-new', name: 'Buttes courges', updatedAt: 200 })
    await db.crops.add({ id: 'c1', name: 'Courges', status: 'en_place', parcelId: 'p-new', updatedAt: 100 })

    await dedupeGardenData()

    const crop = (await db.crops.toArray())[0]
    expect(crop.parcelId).toBe('p-old')
  })
})
