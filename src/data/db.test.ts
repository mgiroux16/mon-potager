import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('PotagerDB', () => {
  it('expose les 10 tables du modèle', () => {
    const names = db.tables.map((t) => t.name).sort()
    expect(names).toEqual(
      [
        'catalog',
        'crops',
        'expenses',
        'log',
        'oyas',
        'parcels',
        'settings',
        'soil',
        'tanks',
        'trees',
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
