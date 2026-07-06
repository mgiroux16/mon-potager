import { db } from '../data/db'
import type { TableName } from '../data/syncHooks'
import { markRemoteWrite, withMaintenanceMode } from '../data/syncHooks'
import {
  fetchAllRecords,
  fetchRecordsSince,
  pushRecords,
  watchTable,
  type DocChange,
} from '../data/firestoreClient'
import { resolveMerge } from './syncMerge'

export const TABLE_NAMES: TableName[] = [
  'parcels',
  'crops',
  'expenses',
  'soil',
  'seasonNotes',
]

// Recouvrement pour absorber les décalages d'horloge entre appareils.
// La requête incrémentale part de (cursor - buffer) au lieu de cursor.
const CLOCK_SKEW_BUFFER_MS = 5 * 60 * 1000

// getDocs() avec persistentLocalCache peut rester bloqué indéfiniment sur reseau
// instable (connexion mobile) : ni resolve ni reject, ce qui bloquait Promise.all
// pour toujours (statut "syncing" figé, bouton "Resynchroniser tout" jamais debloque).
// Ce timeout force chaque table a echouer proprement au lieu de pendre.
const SYNC_TABLE_TIMEOUT_MS = 20_000

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[sync] delai depasse (${ms}ms) pour ${label}`))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error'

let status: SyncStatus = 'offline'

export function getSyncStatus(): SyncStatus {
  return status
}

function getLastSyncAt(table: TableName): number | null {
  try {
    const v = localStorage.getItem(`sync:lastAt:${table}`)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

function setLastSyncAt(table: TableName, ms: number): void {
  try {
    localStorage.setItem(`sync:lastAt:${table}`, String(ms))
  } catch {
    // Ignore (ex : navigation privée sans localStorage)
  }
}

/** Efface tous les curseurs pour forcer un full-sync au prochain runInitialSync. */
export function resetSyncCursors(): void {
  for (const table of TABLE_NAMES) {
    try {
      localStorage.removeItem(`sync:lastAt:${table}`)
    } catch {
      // ignore
    }
  }
}

async function syncTable(uid: string, table: TableName): Promise<number> {
  const lastSyncAt = getLastSyncAt(table)
  const isIncremental = lastSyncAt !== null

  // Fetch remote : incrémental avec buffer de recouvrement, ou full-sync au premier lancement
  const remoteRows = isIncremental
    ? await fetchRecordsSince(uid, table, lastSyncAt - CLOCK_SKEW_BUFFER_MS)
    : await fetchAllRecords(uid, table)

  const docsRead = remoteRows.length
  const remoteById = new Map(remoteRows.map((r) => [r.id as string, r]))

  // Fetch local delta en mémoire (taille mono-utilisateur, pas de contrainte de perf).
  // Lecture en mode maintenance : le merge doit voir les tombstones locaux, sinon une
  // ligne supprimée passe pour absente et le tombstone distant est réappliqué (et
  // ré-échangé) à chaque sync.
  const allLocalRows = (await withMaintenanceMode(() =>
    db.table(table).toArray(),
  )) as Record<string, unknown>[]
  const localDelta = isIncremental
    ? allLocalRows.filter(
        (r) => ((r.updatedAt as number | undefined) ?? 0) > lastSyncAt - CLOCK_SKEW_BUFFER_MS,
      )
    : allLocalRows
  const localById = new Map(localDelta.map((r) => [r.id as string, r]))

  const allIds = new Set([...remoteById.keys(), ...localById.keys()])
  const toPush: { id: string; data: Record<string, unknown> }[] = []

  for (const id of allIds) {
    const local = localById.get(id)
    const remote = remoteById.get(id)

    // Deja en phase (meme updatedAt des deux cotes) : ne rien re-echanger. Sans ce
    // court-circuit, l'egalite renvoyait la reference locale et chaque full sync
    // re-poussait toute la base vers Firestore.
    if (
      local !== undefined &&
      remote !== undefined &&
      ((local.updatedAt as number | undefined) ?? 0) ===
        ((remote.updatedAt as number | undefined) ?? 0)
    ) {
      continue
    }

    const winner = resolveMerge(local, remote)
    if (winner === undefined) continue

    if (winner === remote && winner !== local) {
      try {
        markRemoteWrite(table, winner)
        await db.table(table).put(winner)
      } catch (err) {
        console.error(`[sync] put local ignore ${table}/${id}`, err)
      }
    }
    if (winner === local && winner !== remote) {
      toPush.push({ id, data: winner })
    }
  }

  if (toPush.length > 0) {
    await pushRecords(uid, table, toPush)
  }

  // Avance le curseur sur le max(updatedAt) vu dans le lot (pas Date.now())
  const maxUpdatedAt = remoteRows.reduce(
    (m, r) => Math.max(m, (r.updatedAt as number | undefined) ?? 0),
    0,
  )
  if (maxUpdatedAt > 0) {
    setLastSyncAt(table, maxUpdatedAt)
  }

  return docsRead
}

export async function runInitialSync(uid: string): Promise<void> {
  status = 'syncing'
  const startMs = Date.now()
  let hasError = false

  const counts = await Promise.all(
    TABLE_NAMES.map((table) =>
      withTimeout(syncTable(uid, table), SYNC_TABLE_TIMEOUT_MS, table).catch((err: unknown) => {
        console.error(`[sync] table ${table} echec`, err)
        hasError = true
        return 0
      }),
    ),
  )

  status = hasError ? 'error' : 'synced'

  if (import.meta.env.DEV) {
    const totalDocsRead = counts.reduce((s, n) => s + n, 0)
    console.debug(`[sync:perf] docs lus : ${totalDocsRead}, durée : ${Date.now() - startMs}ms`)
  }
}

const unsubscribers: Array<() => void> = []

export function startRealtimeSync(uid: string): void {
  stopRealtimeSync()
  for (const table of TABLE_NAMES) {
    const unsubscribe = watchTable(uid, table, (changes: DocChange[]) => {
      void Promise.all(
        changes.map(async ({ type, record: remote }) => {
          // Les suppressions passent par tombstone (deletedAt), pas par delete Firestore
          if (type === 'removed') return
          const id = remote.id as string
          // Lecture en mode maintenance : sans elle, un tombstone local est invisible
          // (hook 'reading'), le merge le croit absent et le put + push repartent en
          // boucle infinie via le snapshot local de Firestore.
          const local = (await withMaintenanceMode(() => db.table(table).get(id))) as
            | Record<string, unknown>
            | undefined
          const winner = resolveMerge(local, remote)
          if (winner === remote && winner !== local) {
            markRemoteWrite(table, remote)
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
