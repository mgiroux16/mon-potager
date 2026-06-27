import Dexie, { type Table } from 'dexie'
import type {
  GardenLogEntry,
  Parcel,
  Crop,
  Oya,
  FruitTree,
  WaterTank,
  CatalogItem,
  Expense,
  SoilNote,
  AppSettings,
  Variety,
  SeasonNote,
} from './model'

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

const FINAL_STORES: Record<string, string> = {
  log: 'id, type, date, parcelId, cropId, oyaId, treeId, varietyId',
  parcels: 'id, name',
  crops: 'id, name, parcelId, catalogId, status, varietyId',
  oyas: 'id, name, parcelId',
  trees: 'id, name, parcelId',
  tanks: 'id, name',
  catalog: 'id, vegetable, family',
  expenses: 'id, date, amortization, parcelId, cropId',
  soil: 'id, date, parcelId',
  settings: 'id',
  varieties: 'id, name, vegetable, catalogId',
  seasonNotes: 'id, year, cropId, parcelId',
}

const TMP_SUFFIX = '_v4tmp'

export class PotagerDB extends Dexie {
  log!: Table<GardenLogEntry, string>
  parcels!: Table<Parcel, string>
  crops!: Table<Crop, string>
  oyas!: Table<Oya, string>
  trees!: Table<FruitTree, string>
  tanks!: Table<WaterTank, string>
  catalog!: Table<CatalogItem, string>
  expenses!: Table<Expense, string>
  soil!: Table<SoilNote, string>
  settings!: Table<AppSettings, string>
  varieties!: Table<Variety, string>
  seasonNotes!: Table<SeasonNote, string>

  constructor() {
    super('mon-potager')
    this.version(1).stores({
      log: '++id, type, date, parcelId, cropId, oyaId, treeId',
      parcels: '++id, name',
      crops: '++id, name, parcelId, catalogId, status',
      oyas: '++id, name, parcelId',
      trees: '++id, name, parcelId',
      tanks: '++id, name',
      catalog: '++id, vegetable, family',
      expenses: '++id, date, amortization, parcelId, cropId',
      soil: '++id, date, parcelId',
      settings: '++id',
    })
    this.version(2).stores({
      log: '++id, type, date, parcelId, cropId, oyaId, treeId, varietyId',
      crops: '++id, name, parcelId, catalogId, status, varietyId',
      varieties: '++id, name, vegetable, catalogId',
    })
    this.version(3).stores({
      seasonNotes: '++id, year, cropId, parcelId',
    })

    // Migration UUID : les ids numeriques auto-increment ne resistent pas a une
    // synchro multi-appareils (collisions garanties). On bascule tout sur des ids
    // string (UUID), generes par l'app, jamais par Dexie.
    //
    // Dexie ne sait pas changer la cle primaire d'une table en place ("Not yet
    // support for changing primary key"). Le seul chemin sur est de passer par des
    // tables temporaires : v4 copie/transforme vers des tables "_v4tmp", v5 supprime
    // les anciennes tables (cle numerique), v6 recree les tables finales (cle string)
    // et y recopie le contenu des tables temporaires, v7 nettoie le temporaire.
    this.version(4)
      .stores(
        Object.fromEntries(
          TABLE_NAMES.map((name) => [`${name}${TMP_SUFFIX}`, FINAL_STORES[name]]),
        ),
      )
      .upgrade(async (tx) => {
        const newId = () => crypto.randomUUID()

        const buildMap = async (tableName: string) => {
          const rows = await tx.table(tableName).toArray()
          const map = new Map<number, string>()
          for (const row of rows) {
            if (typeof row.id === 'number') map.set(row.id, newId())
          }
          return { rows, map }
        }

        const { rows: parcelRows, map: parcelMap } = await buildMap('parcels')
        const { rows: catalogRows, map: catalogMap } = await buildMap('catalog')
        const { rows: varietyRows, map: varietyMap } = await buildMap('varieties')
        const { rows: cropRows, map: cropMap } = await buildMap('crops')
        const { rows: oyaRows, map: oyaMap } = await buildMap('oyas')
        const { rows: treeRows, map: treeMap } = await buildMap('trees')
        const { rows: tankRows, map: tankMap } = await buildMap('tanks')
        const { rows: expenseRows, map: expenseMap } = await buildMap('expenses')
        const { rows: soilRows, map: soilMap } = await buildMap('soil')
        const { rows: seasonNoteRows, map: seasonNoteMap } = await buildMap('seasonNotes')
        const { rows: logRows, map: logMap } = await buildMap('log')
        void tankMap
        void soilMap
        void seasonNoteMap
        void logMap

        const remap = (oldId: number | string | undefined, map: Map<number, string>) =>
          typeof oldId === 'number' ? map.get(oldId) : oldId

        const rewrite = async (
          tableName: string,
          rows: Record<string, unknown>[],
          ownMap: Map<number, string>,
          fk: Record<string, Map<number, string>> = {},
          fkArrays: Record<string, Map<number, string>> = {},
        ) => {
          const target = tx.table(`${tableName}${TMP_SUFFIX}`)
          for (const row of rows) {
            const oldOwnId = row.id as number
            const next: Record<string, unknown> = { ...row, id: ownMap.get(oldOwnId) ?? newId() }
            for (const [field, map] of Object.entries(fk)) {
              if (typeof row[field] === 'number') next[field] = remap(row[field] as number, map)
            }
            for (const [field, map] of Object.entries(fkArrays)) {
              if (Array.isArray(row[field])) {
                next[field] = (row[field] as number[]).map((v) => map.get(v) ?? v)
              }
            }
            await target.add(next)
          }
        }

        await rewrite('parcels', parcelRows, parcelMap)
        await rewrite('catalog', catalogRows, catalogMap)
        await rewrite('varieties', varietyRows, varietyMap, { catalogId: catalogMap })
        await rewrite('crops', cropRows, cropMap, {
          parcelId: parcelMap,
          catalogId: catalogMap,
          varietyId: varietyMap,
        })
        await rewrite('oyas', oyaRows, oyaMap, { parcelId: parcelMap }, { cropIds: cropMap })
        await rewrite('trees', treeRows, treeMap, { parcelId: parcelMap })
        await rewrite('tanks', tankRows, tankMap)
        await rewrite('expenses', expenseRows, expenseMap, { parcelId: parcelMap, cropId: cropMap })
        await rewrite('soil', soilRows, soilMap, { parcelId: parcelMap })
        await rewrite('seasonNotes', seasonNoteRows, seasonNoteMap, {
          cropId: cropMap,
          parcelId: parcelMap,
        })
        await rewrite('log', logRows, logMap, {
          parcelId: parcelMap,
          cropId: cropMap,
          oyaId: oyaMap,
          treeId: treeMap,
          varietyId: varietyMap,
          expenseId: expenseMap,
        })

        const settingsRows = await tx.table('settings').toArray()
        const settingsTarget = tx.table(`settings${TMP_SUFFIX}`)
        for (const row of settingsRows) {
          await settingsTarget.add({ ...row, id: 'settings' })
        }
      })

    this.version(5).stores(Object.fromEntries(TABLE_NAMES.map((name) => [name, null])))

    this.version(6)
      .stores(Object.fromEntries(TABLE_NAMES.map((name) => [name, FINAL_STORES[name]])))
      .upgrade(async (tx) => {
        for (const name of TABLE_NAMES) {
          const rows = await tx.table(`${name}${TMP_SUFFIX}`).toArray()
          if (rows.length > 0) await tx.table(name).bulkAdd(rows)
        }
      })

    this.version(7).stores(
      Object.fromEntries(TABLE_NAMES.map((name) => [`${name}${TMP_SUFFIX}`, null])),
    )
  }
}

export const db = new PotagerDB()

export const newId = (): string => crypto.randomUUID()
