import { describe, it, expect, beforeEach } from 'vitest'
import { db, newId } from '../data/db'
import { exportAll } from './exportService'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('exportService', () => {
  it('exporte toutes les tables avec un en-tête de version', async () => {
    await db.log.add({ id: newId(), type: 'note', date: '2026-06-25', title: 'test', createdAt: 1 })
    await db.varieties.add({ id: newId(), name: 'Agata', vegetable: 'Pomme de terre' })
    const dump = await exportAll()
    expect(dump.version).toBe(8)
    expect(typeof dump.exportedAt).toBe('number')
    expect(dump.tables.log).toHaveLength(1)
    expect(dump.tables.varieties).toHaveLength(1)
    // toutes les tables de la base sont présentes
    expect(Object.keys(dump.tables).sort()).toEqual(db.tables.map((t) => t.name).sort())
  })
})
