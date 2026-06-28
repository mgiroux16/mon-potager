import { describe, it, expect, beforeEach } from 'vitest'
import { db, newId } from '../data/db'
import {
  exportAll,
  exportCropsCsv,
  exportHarvestsCsv,
  exportLogCsv,
  exportParcelsCsv,
  logAudit,
} from './exportService'

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

  it('exportCropsCsv filtre par saison et trace l\'audit', async () => {
    await db.crops.add({ id: 'c1', name: 'Tomate', status: 'en_place', plantingDate: '2025-05-01' })
    await db.crops.add({ id: 'c2', name: 'Poireau', status: 'en_place', plantingDate: '2026-03-01' })
    const csv = await exportCropsCsv(2025)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('Tomate')
    const entries = await db.auditLog.toArray()
    expect(entries.some((e) => e.label === 'CSV — Cultures saison 2025')).toBe(true)
  })

  it('exportCropsCsv sans filtre exporte toutes les cultures', async () => {
    await db.crops.add({ id: 'c1', name: 'Tomate', status: 'en_place', plantingDate: '2025-05-01' })
    await db.crops.add({ id: 'c2', name: 'Poireau', status: 'en_place', plantingDate: '2026-03-01' })
    const csv = await exportCropsCsv()
    expect(csv.split('\n')).toHaveLength(3)
  })

  it('exportLogCsv filtre par saison et par parcelle', async () => {
    await db.log.add({ id: 'l1', type: 'arrosage', date: '2025-06-01', parcelId: 'p1', createdAt: 1 })
    await db.log.add({ id: 'l2', type: 'arrosage', date: '2025-06-02', parcelId: 'p2', createdAt: 2 })
    await db.log.add({ id: 'l3', type: 'arrosage', date: '2026-06-02', parcelId: 'p1', createdAt: 3 })
    const csv = await exportLogCsv({ season: 2025, parcelId: 'p1' })
    expect(csv.split('\n')).toHaveLength(2)
    expect(csv).toContain('l1')
  })

  it('exportLogCsv sans filtre exporte toutes les entrées', async () => {
    await db.log.add({ id: 'l1', type: 'arrosage', date: '2025-06-01', createdAt: 1 })
    const csv = await exportLogCsv()
    expect(csv.split('\n')).toHaveLength(2)
  })

  it('exportHarvestsCsv ne garde que les entrées de type recolte, filtrées par saison', async () => {
    await db.log.add({ id: 'l1', type: 'recolte', date: '2025-07-01', quantityKg: 3, createdAt: 1 })
    await db.log.add({ id: 'l2', type: 'arrosage', date: '2025-07-02', createdAt: 2 })
    await db.log.add({ id: 'l3', type: 'recolte', date: '2026-07-02', quantityKg: 2, createdAt: 3 })
    const csv = await exportHarvestsCsv(2025)
    expect(csv.split('\n')).toHaveLength(2)
    expect(csv).toContain('l1')
  })
})
