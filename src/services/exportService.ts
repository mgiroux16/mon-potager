import { db, newId } from '../data/db'
import { cloudBatchWrite, cloudGetAll, type CloudBatchOp } from '../data/firestoreWrites'
import { TABLE_NAMES, type AuditLogType, type Crop, type GardenLogEntry, type Parcel, type TableName } from '../data/model'
import { entryParcelIds } from './logView'

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
  const parcels = (await cloudGetAll('parcels')) as unknown as Parcel[]
  const csv = toCsv(
    ['id', 'name', 'areaM2', 'exposure', 'soil', 'mulch'],
    parcels.map((p) => [p.id, p.name, p.areaM2, p.exposure, p.soil, p.mulch]),
  )
  await logAudit({ type: 'export-csv', label: 'CSV — Parcelles', recordCount: parcels.length })
  return csv
}

function cropYear(crop: Crop): number | undefined {
  const date = crop.plantingDate ?? crop.sowingDate ?? crop.harvestDate
  return date ? Number(date.slice(0, 4)) : undefined
}

export async function exportCropsCsv(season?: number): Promise<string> {
  let crops = (await cloudGetAll('crops')) as unknown as Crop[]
  if (season !== undefined) crops = crops.filter((c) => cropYear(c) === season)
  const csv = toCsv(
    ['id', 'name', 'variety', 'parcelId', 'status', 'sowingDate', 'plantingDate', 'harvestDate'],
    crops.map((c) => [
      c.id,
      c.name,
      c.variety,
      c.parcelId,
      c.status,
      c.sowingDate,
      c.plantingDate,
      c.harvestDate,
    ]),
  )
  const label = season !== undefined ? `CSV — Cultures saison ${season}` : 'CSV — Cultures (toutes saisons)'
  await logAudit({ type: 'export-csv', label, recordCount: crops.length })
  return csv
}

function entryYear(entry: GardenLogEntry): number {
  return Number(entry.date.slice(0, 4))
}

export async function exportLogCsv(
  filters: { season?: number; parcelId?: string } = {},
): Promise<string> {
  let entries = (await cloudGetAll('log')) as unknown as GardenLogEntry[]
  if (filters.season !== undefined) entries = entries.filter((e) => entryYear(e) === filters.season)
  if (filters.parcelId !== undefined) {
    entries = entries.filter((e) => entryParcelIds(e).includes(filters.parcelId as string))
  }
  const csv = toCsv(
    ['id', 'type', 'date', 'title', 'description', 'parcelId', 'cropId', 'quantityKg', 'volumeLiters'],
    entries.map((e) => [
      e.id,
      e.type,
      e.date,
      e.title,
      e.description,
      entryParcelIds(e).join('+') || undefined,
      e.cropId,
      e.quantityKg,
      e.volumeLiters,
    ]),
  )
  await logAudit({ type: 'export-csv', label: 'CSV — Journal', recordCount: entries.length })
  return csv
}

export async function exportHarvestsCsv(season?: number): Promise<string> {
  let entries = ((await cloudGetAll('log')) as unknown as GardenLogEntry[]).filter((e) => e.type === 'recolte')
  if (season !== undefined) entries = entries.filter((e) => entryYear(e) === season)
  const csv = toCsv(
    ['id', 'date', 'title', 'parcelId', 'cropId', 'quantityKg'],
    entries.map((e) => [e.id, e.date, e.title, e.parcelId, e.cropId, e.quantityKg]),
  )
  const label = season !== undefined ? `CSV — Récoltes saison ${season}` : 'CSV — Récoltes (toutes saisons)'
  await logAudit({ type: 'export-csv', label, recordCount: entries.length })
  return csv
}

/** Tables cloud-first + auditLog (seule table restee locale, cf. data/model.ts). */
const ALL_TABLES: readonly string[] = [...TABLE_NAMES, 'auditLog']

export async function exportAll(): Promise<PotagerExport> {
  const tables: Record<string, unknown[]> = {}
  for (const table of TABLE_NAMES) {
    tables[table] = await cloudGetAll(table)
  }
  tables.auditLog = await db.auditLog.toArray()
  const totalRecords = Object.values(tables).reduce((sum, rows) => sum + rows.length, 0)
  await logAudit({ type: 'export-json', label: 'Export JSON complet', recordCount: totalRecords })
  return { version: db.verno, exportedAt: Date.now(), tables }
}

export interface ImportResult {
  tablesImported: string[]
  totalRecords: number
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

export async function importAll(file: File): Promise<ImportResult> {
  const text = await readFileText(file)
  const parsed = JSON.parse(text) as PotagerExport
  const knownTables = new Set(ALL_TABLES)
  const tablesImported: string[] = []
  let totalRecords = 0
  const ops: CloudBatchOp[] = []

  for (const [name, records] of Object.entries(parsed.tables ?? {})) {
    if (!knownTables.has(name) || !Array.isArray(records) || records.length === 0) continue

    if (name === 'auditLog') {
      await db.auditLog.bulkPut(records as never[])
    } else {
      for (const record of records as Record<string, unknown>[]) {
        ops.push({ type: 'set', table: name as TableName, id: record.id as string, data: record })
      }
    }
    tablesImported.push(name)
    totalRecords += records.length
  }

  if (ops.length > 0) await cloudBatchWrite(ops)

  await logAudit({ type: 'import', label: 'Import (fusion)', recordCount: totalRecords })
  return { tablesImported, totalRecords }
}
