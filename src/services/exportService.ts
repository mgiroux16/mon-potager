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

export async function exportAll(): Promise<PotagerExport> {
  const tables: Record<string, unknown[]> = {}
  for (const table of db.tables) {
    tables[table.name] = await table.toArray()
  }
  const totalRecords = Object.values(tables).reduce((sum, rows) => sum + rows.length, 0)
  await logAudit({ type: 'export-json', label: 'Export JSON complet', recordCount: totalRecords })
  return { version: db.verno, exportedAt: Date.now(), tables }
}
