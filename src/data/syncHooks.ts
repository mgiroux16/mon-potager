import { db } from './db'
import { pushRecord } from './firestoreClient'

const TABLE_NAMES = [
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
] as const

export type TableName = (typeof TABLE_NAMES)[number]

let installed = false
let activeUid: string | null = null
// Compteur (et non booleen) : la sync lance des lectures maintenance en parallele
// (Promise.all sur 12 tables), un booleen retombait a false des la premiere finie.
let maintenanceDepth = 0

export function setSyncUid(uid: string | null): void {
  activeUid = uid
}

// Permet a une operation de maintenance (ex: purge des tombstones, merge de sync) de voir
// les lignes avec deletedAt, que le hook 'reading' filtre de toute lecture applicative.
export function withMaintenanceMode<T>(fn: () => Promise<T>): Promise<T> {
  maintenanceDepth++
  return fn().finally(() => {
    maintenanceDepth--
  })
}

// Cles "table|id|updatedAt" des ecritures en cours d'application DEPUIS Firestore.
// Le hook de push les consomme sans re-pousser : sans ce garde-fou, chaque changement
// distant applique en local repartait vers Firestore (echo), et sur une ligne tombstone
// (invisible du hook 'reading') cet echo bouclait a l'infini snapshot -> put -> push ->
// snapshot, saturant CPU et memoire (onglet a plusieurs Go).
const remoteEchoKeys = new Set<string>()

function echoKey(table: string, id: unknown, updatedAt: unknown): string {
  return `${table}|${String(id)}|${String(updatedAt)}`
}

/** A appeler juste avant un put() qui applique une ligne venant de Firestore. */
export function markRemoteWrite(table: TableName, row: Record<string, unknown>): void {
  remoteEchoKeys.add(echoKey(table, row.id, row.updatedAt))
}

function consumeRemoteWrite(table: TableName, id: unknown, updatedAt: unknown): boolean {
  return remoteEchoKeys.delete(echoKey(table, id, updatedAt))
}

export function installSyncHooks(): void {
  if (installed) return
  installed = true

  for (const name of TABLE_NAMES) {
    const table = db.table(name)

    table.hook('creating', (_primKey, obj) => {
      if (typeof (obj as Record<string, unknown>).updatedAt !== 'number') {
        ;(obj as Record<string, unknown>).updatedAt = Date.now()
      }
    })

    table.hook('updating', (modifications) => {
      const mods = modifications as Record<string, unknown>
      if (typeof mods.updatedAt !== 'number') {
        return { ...mods, updatedAt: Date.now() }
      }
      return modifications
    })

    table.hook('reading', (obj) => {
      if (maintenanceDepth > 0) return obj
      if (obj === undefined) return obj
      const row = obj as Record<string, unknown>
      return typeof row.deletedAt === 'number' ? undefined : obj
    })

    // On pousse les donnees deja en main dans le hook (obj cree, ou obj original +
    // modifications) plutot que de relire via table.get() : ce dernier passe par le
    // hook 'reading', qui filtrerait une ligne venant d'etre marquee deletedAt (softDelete)
    // et empecherait la propagation du tombstone vers Firestore.
    table.hook('creating').subscribe(function (
      this: { onsuccess?: (id: unknown) => void },
      _primKey: unknown,
      obj: unknown,
    ) {
      this.onsuccess = (id: unknown) => {
        if (activeUid === null) return
        const row = obj as Record<string, unknown>
        if (consumeRemoteWrite(name, id, row.updatedAt)) return
        void pushRecord(activeUid, name, id as string, row)
      }
    })

    table.hook('updating').subscribe(function (
      this: { onsuccess?: (id: unknown) => void },
      modifications: unknown,
      primKey: unknown,
      obj: unknown,
    ) {
      this.onsuccess = () => {
        if (activeUid === null) return
        const merged = { ...(obj as Record<string, unknown>), ...(modifications as Record<string, unknown>) }
        if (consumeRemoteWrite(name, primKey, merged.updatedAt)) return
        void pushRecord(activeUid, name, primKey as string, merged)
      }
    })
  }

  // Toutes les tables d'une meme base Dexie partagent le meme prototype Table : un seul
  // patch ici suffit pour tout le monde. Le hook 'reading' transforme chaque ligne
  // individuellement mais ne retire pas les entrees devenues `undefined` d'un tableau,
  // donc toArray() doit filtrer explicitement le resultat.
  const tableProto = Object.getPrototypeOf(db.table(TABLE_NAMES[0])) as {
    toArray: (thenShortcut?: (rows: unknown[]) => unknown) => Promise<unknown>
  }
  const originalToArray = tableProto.toArray
  tableProto.toArray = function (thenShortcut?: (rows: unknown[]) => unknown) {
    const result = (originalToArray.call(this) as Promise<unknown[]>).then((rows) =>
      rows.filter((r) => r !== undefined),
    )
    return thenShortcut ? result.then(thenShortcut) : result
  }
}

export async function softDelete(table: TableName, id: string): Promise<void> {
  await db.table(table).update(id, { deletedAt: Date.now() })
}
