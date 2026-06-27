import { db } from './db'

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
] as const

export type TableName = (typeof TABLE_NAMES)[number]

let installed = false

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
      if (obj === undefined) return obj
      const row = obj as Record<string, unknown>
      return typeof row.deletedAt === 'number' ? undefined : obj
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
