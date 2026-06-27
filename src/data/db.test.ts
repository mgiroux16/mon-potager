import { describe, it, expect, beforeEach } from 'vitest'
import { db, newId } from './db'

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
    const id = newId()
    await db.log.add({
      id,
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
    const id = newId()
    await db.varieties.add({ id, name: 'Saint-Pierre', vegetable: 'Tomate' })
    const stored = await db.varieties.get(id)
    expect(stored?.name).toBe('Saint-Pierre')
  })

  it('permet de filtrer le journal par varietyId', async () => {
    await db.log.add({ id: newId(), type: 'recolte', date: '2026-06-25', varietyId: 'variety-7', createdAt: 1 })
    await db.log.add({ id: newId(), type: 'recolte', date: '2026-06-25', varietyId: 'variety-9', createdAt: 2 })
    const found = await db.log.where('varietyId').equals('variety-7').toArray()
    expect(found).toHaveLength(1)
  })
})

describe('migration version 4 (UUID)', () => {
  it('utilise des ids string non auto-incrementes', async () => {
    const id = newId()
    await db.parcels.add({ id, name: 'Test' })
    const stored = await db.parcels.get(id)
    expect(stored?.id).toBe(id)
    expect(typeof stored?.id).toBe('string')
  })
})
