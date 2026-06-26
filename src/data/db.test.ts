import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('PotagerDB', () => {
  it('expose les 12 tables du modèle', () => {
    const names = db.tables.map((t) => t.name).sort()
    expect(names).toEqual(
      [
        'catalog',
        'crops',
        'expenses',
        'log',
        'oyas',
        'parcels',
        'seasonNotes',
        'settings',
        'soil',
        'tanks',
        'trees',
        'varieties',
      ].sort(),
    )
  })

  it('écrit et relit une entrée de journal', async () => {
    const id = await db.log.add({
      type: 'arrosage',
      date: '2026-06-24',
      volumeLiters: 30,
      createdAt: Date.now(),
    })
    const back = await db.log.get(id)
    expect(back?.type).toBe('arrosage')
    expect(back?.volumeLiters).toBe(30)
  })
})

describe('migration version 2', () => {
  it('expose le store varieties', async () => {
    const id = await db.varieties.add({ name: 'Saint-Pierre', vegetable: 'Tomate' })
    const stored = await db.varieties.get(id)
    expect(stored?.name).toBe('Saint-Pierre')
  })

  it('permet de filtrer le journal par varietyId', async () => {
    await db.log.add({ type: 'recolte', date: '2026-06-25', varietyId: 7, createdAt: 1 })
    await db.log.add({ type: 'recolte', date: '2026-06-25', varietyId: 9, createdAt: 2 })
    const found = await db.log.where('varietyId').equals(7).toArray()
    expect(found).toHaveLength(1)
  })
})
