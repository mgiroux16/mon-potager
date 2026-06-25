import { db } from '../data/db'

export interface PotagerExport {
  version: number
  exportedAt: number
  tables: Record<string, unknown[]>
}

export async function exportAll(): Promise<PotagerExport> {
  const tables: Record<string, unknown[]> = {}
  for (const table of db.tables) {
    tables[table.name] = await table.toArray()
  }
  return { version: db.verno, exportedAt: Date.now(), tables }
}
