import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../data/db'
import { TABLE_NAMES } from '../data/model'

let store: Record<string, Record<string, unknown>[]> = {}
const cloudGetAllMock = vi.fn(async (table: string) => store[table] ?? [])
const cloudBatchWriteMock = vi.fn(async (ops: { type: string; table: string; id: string; data?: Record<string, unknown> }[]) => {
  for (const op of ops) {
    const rows = store[op.table] ?? []
    if (op.type === 'delete') {
      store[op.table] = rows.filter((r) => r.id !== op.id)
    } else {
      const exists = rows.some((r) => r.id === op.id)
      store[op.table] = exists
        ? rows.map((r) => (r.id === op.id ? { ...r, ...op.data } : r))
        : [...rows, { id: op.id, ...op.data }]
    }
  }
})
vi.mock('../data/firestoreWrites', () => ({
  cloudGetAll: (...args: [string]) => cloudGetAllMock(...args),
  cloudBatchWrite: (...args: Parameters<typeof cloudBatchWriteMock>) => cloudBatchWriteMock(...args),
}))

import {
  exportAll,
  exportCropsCsv,
  exportHarvestsCsv,
  exportLogCsv,
  exportParcelsCsv,
  importAll,
  logAudit,
} from './exportService'

function seed(table: string, rows: Record<string, unknown>[]): void {
  store[table] = rows
}

beforeEach(async () => {
  store = {}
  vi.clearAllMocks()
  await db.auditLog.clear()
})

function jsonFile(content: unknown): File {
  return new File([JSON.stringify(content)], 'export.json', { type: 'application/json' })
}

describe('exportService', () => {
  it('exporte toutes les tables avec un en-tête de version', async () => {
    seed('log', [{ id: 'l1', type: 'note', date: '2026-06-25', title: 'test', createdAt: 1 }])
    seed('varieties', [{ id: 'v1', name: 'Agata', vegetable: 'Pomme de terre' }])
    const dump = await exportAll()
    expect(dump.version).toBe(db.verno)
    expect(dump.version).toBeGreaterThanOrEqual(11)
    expect(typeof dump.exportedAt).toBe('number')
    expect(dump.tables.log).toHaveLength(1)
    expect(dump.tables.varieties).toHaveLength(1)
    // toutes les tables cloud + auditLog sont presentes
    expect(Object.keys(dump.tables).sort()).toEqual([...TABLE_NAMES, 'auditLog'].sort())
  })

  it('logAudit ajoute une entrée dans auditLog', async () => {
    await logAudit({ type: 'import', label: 'Test', recordCount: 3 })
    const entries = await db.auditLog.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ type: 'import', label: 'Test', recordCount: 3 })
    expect(typeof entries[0].date).toBe('number')
  })

  it('exportAll trace une entrée export-json dans auditLog', async () => {
    seed('parcels', [{ id: 'p1', name: 'Parcelle test' }])
    await exportAll()
    const entries = await db.auditLog.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe('export-json')
  })

  it('exportParcelsCsv génère un CSV avec en-têtes et échappement', async () => {
    seed('parcels', [{ id: 'p1', name: 'Carré nord', areaM2: 12, soil: 'argileux; humide' }])
    const csv = await exportParcelsCsv()
    const lines = csv.split('\n')
    expect(lines[0]).toBe('id;name;areaM2;exposure;soil;mulch')
    expect(lines[1]).toBe('p1;Carré nord;12;;"argileux; humide";')
    const entries = await db.auditLog.toArray()
    expect(entries.some((e) => e.type === 'export-csv' && e.label === 'CSV — Parcelles')).toBe(true)
  })

  it('exportCropsCsv filtre par saison et trace l\'audit', async () => {
    seed('crops', [
      { id: 'c1', name: 'Tomate', status: 'en_place', plantingDate: '2025-05-01' },
      { id: 'c2', name: 'Poireau', status: 'en_place', plantingDate: '2026-03-01' },
    ])
    const csv = await exportCropsCsv(2025)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('Tomate')
    const entries = await db.auditLog.toArray()
    expect(entries.some((e) => e.label === 'CSV — Cultures saison 2025')).toBe(true)
  })

  it('exportCropsCsv sans filtre exporte toutes les cultures', async () => {
    seed('crops', [
      { id: 'c1', name: 'Tomate', status: 'en_place', plantingDate: '2025-05-01' },
      { id: 'c2', name: 'Poireau', status: 'en_place', plantingDate: '2026-03-01' },
    ])
    const csv = await exportCropsCsv()
    expect(csv.split('\n')).toHaveLength(3)
  })

  it('exportLogCsv filtre par saison et par parcelle', async () => {
    seed('log', [
      { id: 'l1', type: 'arrosage', date: '2025-06-01', parcelId: 'p1', createdAt: 1 },
      { id: 'l2', type: 'arrosage', date: '2025-06-02', parcelId: 'p2', createdAt: 2 },
      { id: 'l3', type: 'arrosage', date: '2026-06-02', parcelId: 'p1', createdAt: 3 },
    ])
    const csv = await exportLogCsv({ season: 2025, parcelId: 'p1' })
    expect(csv.split('\n')).toHaveLength(2)
    expect(csv).toContain('l1')
  })

  it('exportLogCsv sans filtre exporte toutes les entrées', async () => {
    seed('log', [{ id: 'l1', type: 'arrosage', date: '2025-06-01', createdAt: 1 }])
    const csv = await exportLogCsv()
    expect(csv.split('\n')).toHaveLength(2)
  })

  it('exportHarvestsCsv ne garde que les entrées de type recolte, filtrées par saison', async () => {
    seed('log', [
      { id: 'l1', type: 'recolte', date: '2025-07-01', quantityKg: 3, createdAt: 1 },
      { id: 'l2', type: 'arrosage', date: '2025-07-02', createdAt: 2 },
      { id: 'l3', type: 'recolte', date: '2026-07-02', quantityKg: 2, createdAt: 3 },
    ])
    const csv = await exportHarvestsCsv(2025)
    expect(csv.split('\n')).toHaveLength(2)
    expect(csv).toContain('l1')
  })

  it('importAll fusionne par id, le fichier importé gagne toujours', async () => {
    seed('parcels', [
      { id: 'p1', name: 'Ancien nom' },
      { id: 'p2', name: 'Inchangée' },
    ])
    const result = await importAll(
      jsonFile({
        version: 11,
        exportedAt: Date.now(),
        tables: { parcels: [{ id: 'p1', name: 'Nouveau nom' }] },
      }),
    )
    const rows = store.parcels
    expect(rows.find((r) => r.id === 'p1')?.name).toBe('Nouveau nom')
    expect(rows.find((r) => r.id === 'p2')?.name).toBe('Inchangée')
    expect(result).toEqual({ tablesImported: ['parcels'], totalRecords: 1 })
  })

  it('importAll ignore les tables inconnues du fichier', async () => {
    const result = await importAll(
      jsonFile({
        version: 11,
        exportedAt: Date.now(),
        tables: { tableInconnue: [{ id: 'x' }], parcels: [{ id: 'p1', name: 'Test' }] },
      }),
    )
    expect(result.tablesImported).toEqual(['parcels'])
    expect(result.totalRecords).toBe(1)
  })

  it('importAll trace une entrée audit de type import', async () => {
    await importAll(
      jsonFile({ version: 11, exportedAt: Date.now(), tables: { parcels: [{ id: 'p1', name: 'Test' }] } }),
    )
    const entries = await db.auditLog.toArray()
    expect(entries.some((e) => e.type === 'import')).toBe(true)
  })
})
