import { db } from '../data/db'
import type { TableName } from '../data/syncHooks'
import { withMaintenanceMode } from '../data/syncHooks'
import { fetchAllRecords, pushRecord, watchTable } from '../data/firestoreClient'
import { resolveMerge } from './syncMerge'

const TABLE_NAMES: TableName[] = [
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
]

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error'

let status: SyncStatus = 'offline'

export function getSyncStatus(): SyncStatus {
  return status
}

async function syncTable(uid: string, table: TableName): Promise<void> {
  const remoteRows = await fetchAllRecords(uid, table)
  const remoteById = new Map(remoteRows.map((r) => [r.id as string, r]))
  const localRows = (await db.table(table).toArray()) as Record<string, unknown>[]
  const localById = new Map(localRows.map((r) => [r.id as string, r]))

  const allIds = new Set([...remoteById.keys(), ...localById.keys()])

  for (const id of allIds) {
    const local = localById.get(id)
    const remote = remoteById.get(id)
    const winner = resolveMerge(local, remote)
    if (winner === undefined) continue

    try {
      if (winner === remote && winner !== local) {
        await db.table(table).put(winner)
      }
      if (winner === local && winner !== remote) {
        await pushRecord(uid, table, id, winner)
      }
    } catch (err) {
      // Un enregistrement isole (ex: photo > 1 Mo, limite Firestore) ne doit pas
      // faire echouer toute la synchro : on le journalise et on continue.
      console.error(`[sync] enregistrement ignore ${table}/${id}`, err)
    }
  }
}

export async function runInitialSync(uid: string): Promise<void> {
  status = 'syncing'
  try {
    for (const table of TABLE_NAMES) {
      await syncTable(uid, table)
    }
    status = 'synced'
  } catch (err) {
    status = 'error'
    throw err
  }
}

const unsubscribers: Array<() => void> = []

export function startRealtimeSync(uid: string): void {
  stopRealtimeSync()
  for (const table of TABLE_NAMES) {
    const unsubscribe = watchTable(uid, table, (records) => {
      void Promise.all(
        records.map(async (remote) => {
          const id = remote.id as string
          const local = (await db.table(table).get(id)) as Record<string, unknown> | undefined
          const winner = resolveMerge(local, remote)
          if (winner === remote && winner !== local) {
            await db.table(table).put(winner)
          }
        }),
      )
    })
    unsubscribers.push(unsubscribe)
  }
}

export function stopRealtimeSync(): void {
  while (unsubscribers.length > 0) {
    unsubscribers.pop()?.()
  }
}

const TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Tables de reference dont les lignes ont ete creees independamment sur
 * plusieurs appareils avant que la synchro ne fonctionne (meme cle metier,
 * id differents). La fonction de cle identifie les doublons a fusionner.
 */
const DEDUPE_KEYS: Record<string, (row: Record<string, unknown>) => string> = {
  tanks: (row) => row.name as string,
  parcels: (row) => row.name as string,
  trees: (row) => row.name as string,
  catalog: (row) => row.vegetable as string,
  varieties: (row) => `${row.vegetable as string}::${row.name as string}`,
}

/**
 * Fusionne les doublons des tables de reference : on garde la ligne la plus
 * recemment modifiee par cle et on tombstone les autres pour que la
 * suppression se propage via la synchro normale.
 */
export async function dedupeReferenceTables(): Promise<void> {
  for (const [table, keyOf] of Object.entries(DEDUPE_KEYS)) {
    const rows = (await db.table(table).toArray()) as Record<string, unknown>[]
    const active = rows.filter((r) => r.deletedAt == null)
    const byKey = new Map<string, Record<string, unknown>[]>()
    for (const row of active) {
      const key = keyOf(row)
      const group = byKey.get(key) ?? []
      group.push(row)
      byKey.set(key, group)
    }

    for (const group of byKey.values()) {
      if (group.length < 2) continue
      const sorted = [...group].sort(
        (a, b) => ((b.updatedAt as number) ?? 0) - ((a.updatedAt as number) ?? 0),
      )
      const [, ...duplicates] = sorted
      for (const duplicate of duplicates) {
        await db.table(table).put({ ...duplicate, deletedAt: Date.now(), updatedAt: Date.now() })
      }
    }
  }
}

export async function purgeOldTombstones(): Promise<void> {
  const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS
  await withMaintenanceMode(async () => {
    for (const table of TABLE_NAMES) {
      const rows = (await db.table(table).toArray()) as Record<string, unknown>[]
      for (const row of rows) {
        if (typeof row.deletedAt === 'number' && row.deletedAt < cutoff) {
          await db.table(table).delete(row.id as string)
        }
      }
    }
  })
}
