import { db } from '../data/db'
import type { TableName } from '../data/syncHooks'
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

    if (winner === remote && winner !== local) {
      await db.table(table).put(winner)
    }
    if (winner === local && winner !== remote) {
      await pushRecord(uid, table, id, winner)
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
