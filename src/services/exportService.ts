import { db, newId } from '../data/db'
import type { AuditLogType } from '../data/model'

export interface PotagerExport {
  version: number
  exportedAt: number
  tables: Record<string, unknown[]>
}

export async function logAudit(entry: {
  type: AuditLogType
  label: string
  recordCount: number
}): Promise<void> {
  await db.auditLog.add({ id: newId(), date: Date.now(), ...entry })
}

function csvEscape(value: unknown): string {
  if (value === undefined || value === null) return ''
  const str = String(value)
  if (/[;"\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(';'), ...rows.map((row) => row.map(csvEscape).join(';'))]
  return lines.join('\n')
}

export async function exportParcelsCsv(): Promise<string> {
  const parcels = await db.parcels.toArray()
  const csv = toCsv(
    ['id', 'name', 'areaM2', 'exposure', 'soil', 'mulch'],
    parcels.map((p) => [p.id, p.name, p.areaM2, p.exposure, p.soil, p.mulch]),
  )
  await logAudit({ type: 'export-csv', label: 'CSV — Parcelles', recordCount: parcels.length })
  return csv
}

export async function exportAll(): Promise<PotagerExport> {
  const tables: Record<string, unknown[]> = {}
  for (const table of db.tables) {
    tables[table.name] = await table.toArray()
  }
  const totalRecords = Object.values(tables).reduce((sum, rows) => sum + rows.length, 0)
  await logAudit({ type: 'export-json', label: 'Export JSON complet', recordCount: totalRecords })
  return { version: db.verno, exportedAt: Date.now(), tables }
}
