import { describe, it, expect, beforeEach } from 'vitest'
import { db, newId } from '../data/db'
import { exportAll, exportParcelsCsv, logAudit } from './exportService'

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

  it('exportParcelsCsv génère un CSV avec en-têtes et échappement', async () => {
    await db.parcels.add({ id: 'p1', name: 'Carré nord', areaM2: 12, soil: 'argileux; humide' })
    const csv = await exportParcelsCsv()
    const lines = csv.split('\n')
    expect(lines[0]).toBe('id;name;areaM2;exposure;soil;mulch')
    expect(lines[1]).toBe('p1;Carré nord;12;;"argileux; humide";')
    const entries = await db.auditLog.toArray()
    expect(entries.some((e) => e.type === 'export-csv' && e.label === 'CSV — Parcelles')).toBe(true)
  })
})
