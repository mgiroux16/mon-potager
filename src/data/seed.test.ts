import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { seedDatabase, seedParcels, seedCrops } from './seed'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('seedDatabase', () => {
  it('charge le jardin réel dans une base vide', async () => {
    await seedDatabase(db)
    expect(await db.parcels.count()).toBe(seedParcels.length)
    expect(await db.crops.count()).toBe(seedCrops.length)
    expect(await db.trees.count()).toBeGreaterThan(0)
    expect(await db.tanks.count()).toBe(5)
    expect(await db.catalog.count()).toBeGreaterThan(0)
    expect(await db.settings.count()).toBe(1)
  })

  it('est idempotent (un second appel ne duplique rien)', async () => {
    await seedDatabase(db)
    await seedDatabase(db)
    expect(await db.parcels.count()).toBe(seedParcels.length)
    expect(await db.crops.count()).toBe(seedCrops.length)
  })

  it('câble les cultures à des parcelles existantes', async () => {
    await seedDatabase(db)
    const crops = await db.crops.toArray()
    const parcelIds = new Set((await db.parcels.toArray()).map((p) => p.id))
    for (const crop of crops) {
      if (crop.parcelId !== undefined) {
        expect(parcelIds.has(crop.parcelId)).toBe(true)
      }
    }
  })
})
