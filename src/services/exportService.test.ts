import { describe, it, expect, beforeEach } from 'vitest'
import { db, newId } from '../data/db'
import { exportAll, logAudit } from './exportService'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('exportService', () => {
  it('exporte toutes les tables avec un en-tête de version', async () => {
    await db.log.add({ id: newId(), type: 'note', date: '2026-06-25', title: 'test', createdAt: 1 })
    await db.varieties.add({ id: newId(), name: 'Agata', vegetable: 'Pomme de terre' })
    const dump = await exportAll()
    expect(dump.version).toBe(11)
    expect(typeof dump.exportedAt).toBe('number')
    expect(dump.tables.log).toHaveLength(1)
    expect(dump.tables.varieties).toHaveLength(1)
    // toutes les tables de la base sont présentes
    expect(Object.keys(dump.tables).sort()).toEqual(db.tables.map((t) => t.name).sort())
  })

  it('logAudit ajoute une entrée dans auditLog', async () => {
    await logAudit({ type: 'import', label: 'Test', recordCount: 3 })
    const entries = await db.auditLog.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ type: 'import', label: 'Test', recordCount: 3 })
    expect(typeof entries[0].date).toBe('number')
  })

  it('exportAll trace une entrée export-json dans auditLog', async () => {
    await db.parcels.add({ id: newId(), name: 'Parcelle test' })
    await exportAll()
    const entries = await db.auditLog.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe('export-json')
  })
})
