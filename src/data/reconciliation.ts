import { db } from './db'
import { withMaintenanceMode } from './syncHooks'
import type { TableName } from './syncHooks'
import { fetchAllRecords, pushRecords } from './firestoreClient'

// Outil de securite des donnees, etape 2 de la migration cloud-first (voir docs/audit/).
// Read-only par defaut (buildReconciliationReport) + push explicite des orphelins locaux
// (pushMissingRecords). Ne bascule aucune lecture d'ecran : Dexie reste la source de
// verite affichee partout, ceci ne fait que garantir que Firestore contient une copie
// complete du local avant de lui faire confiance.

// Miroir de TABLE_NAMES (src/data/syncHooks.ts). Duplique ici plutot qu'exporte depuis
// syncHooks.ts : hors perimetre de cette etape, qui ne touche pas au sync maison. A tenir
// a jour si une table rejoint/quitte la synchro. auditLog est volontairement absente : elle
// n'est pas synchronisee (voir syncHooks.ts).
export const SYNCED_TABLES: TableName[] = [
  'log',
  'parcels',
  'crops',
  'oyas',
  'trees',
  'tanks',
  'catalog',
  'expenses',
  'soil',
  'settings',
  'varieties',
  'seasonNotes',
  'diagnostics',
]

type Row = Record<string, unknown> & { id: string }

export interface TableReconciliationReport {
  table: TableName
  localActive: number
  localTombstoned: number
  serverTotal: number
  serverActive: number
  serverTombstoned: number
  localOnlyIds: string[]
  serverOnlyIds: string[]
  pushedIds: string[]
}

function isTombstoned(row: Record<string, unknown>): boolean {
  return typeof row.deletedAt === 'number'
}

async function readLocalRows(table: TableName): Promise<Row[]> {
  // withMaintenanceMode : sans ca, le hook 'reading' de la synchro maison masque les
  // lignes deletedAt (tombstones). Elles doivent pourtant etre vues et poussees telles
  // quelles, pour ne jamais ressusciter une suppression locale absente du serveur.
  const rows = await withMaintenanceMode(() => db.table(table).toArray())
  return rows as Row[]
}

/** Compare local (Dexie) et serveur (Firestore) pour une table, sans rien ecrire. */
export async function buildReconciliationReport(
  uid: string,
  table: TableName,
): Promise<TableReconciliationReport> {
  const [localRows, serverRows] = await Promise.all([
    readLocalRows(table),
    fetchAllRecords(uid, table) as Promise<Row[]>,
  ])

  const localIds = new Set(localRows.map((r) => r.id))
  const serverIds = new Set(serverRows.map((r) => r.id))

  return {
    table,
    localActive: localRows.filter((r) => !isTombstoned(r)).length,
    localTombstoned: localRows.filter(isTombstoned).length,
    serverTotal: serverRows.length,
    serverActive: serverRows.filter((r) => !isTombstoned(r)).length,
    serverTombstoned: serverRows.filter(isTombstoned).length,
    localOnlyIds: [...localIds].filter((id) => !serverIds.has(id)),
    serverOnlyIds: [...serverIds].filter((id) => !localIds.has(id)),
    pushedIds: [],
  }
}

/**
 * Pousse vers Firestore les lignes locales dont l'ID est absent du serveur. Pousse la
 * ligne telle quelle (deletedAt inclus si tombstone) : ne reconstruit jamais un
 * enregistrement, donc ne ressuscite jamais une suppression locale.
 */
export async function pushMissingRecords(
  uid: string,
  table: TableName,
  localOnlyIds: string[],
): Promise<string[]> {
  if (localOnlyIds.length === 0) return []
  const idSet = new Set(localOnlyIds)
  const localRows = await readLocalRows(table)
  const items = localRows.filter((r) => idSet.has(r.id)).map((r) => ({ id: r.id, data: r }))
  await pushRecords(uid, table, items)
  return items.map((i) => i.id)
}

/**
 * Reconciliation complete d'une table : rapport, push des orphelins locaux, puis
 * rapport final si quelque chose a ete pousse (sinon le premier rapport suffit).
 */
export async function reconcileTable(
  uid: string,
  table: TableName,
): Promise<TableReconciliationReport> {
  const before = await buildReconciliationReport(uid, table)
  const pushedIds = await pushMissingRecords(uid, table, before.localOnlyIds)
  if (pushedIds.length === 0) return before
  const after = await buildReconciliationReport(uid, table)
  return { ...after, pushedIds }
}

/** Reconciliation de toutes les tables synchronisees, une par une (sequentiel). */
export async function reconcileAll(uid: string): Promise<TableReconciliationReport[]> {
  const reports: TableReconciliationReport[] = []
  for (const table of SYNCED_TABLES) {
    reports.push(await reconcileTable(uid, table))
  }
  return reports
}
