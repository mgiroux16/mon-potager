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
  Diagnostic,
  AuditLogEntry,
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
  log: 'id, type, date, parcelId, cropId, oyaId, treeId, varietyId, updatedAt',
  parcels: 'id, name, updatedAt',
  crops: 'id, name, parcelId, catalogId, status, varietyId, updatedAt',
  oyas: 'id, name, parcelId, updatedAt',
  trees: 'id, name, parcelId, updatedAt',
  tanks: 'id, name, updatedAt',
  catalog: 'id, vegetable, family, updatedAt',
  expenses: 'id, date, amortization, parcelId, cropId, updatedAt',
  soil: 'id, date, parcelId, updatedAt',
  settings: 'id, updatedAt',
  varieties: 'id, name, vegetable, catalogId, updatedAt',
  seasonNotes: 'id, year, cropId, parcelId, updatedAt',
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
  diagnostics!: Table<Diagnostic, string>
  auditLog!: Table<AuditLogEntry, string>

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

    this.version(8)
      .stores(Object.fromEntries(TABLE_NAMES.map((name) => [name, FINAL_STORES[name]])))
      .upgrade(async (tx) => {
        for (const name of TABLE_NAMES) {
          const rows = await tx.table(name).toArray()
          for (const row of rows) {
            if (typeof row.updatedAt !== 'number') {
              await tx.table(name).update(row.id, {
                updatedAt: typeof row.createdAt === 'number' ? row.createdAt : Date.now(),
              })
            }
          }
        }
      })

    // Les coordonnees par defaut (centre de Champniers) etaient a ~2,2 km de
    // l'adresse reelle, assez pour rater une pluie locale dans le modele
    // meteo. On ne corrige que si Mathieu n'a jamais touche le reglage.
    this.version(9).stores({}).upgrade(async (tx) => {
      const settings = await tx.table('settings').get('settings')
      if (settings && settings.latitude === 45.72 && settings.longitude === 0.19) {
        await tx.table('settings').update('settings', {
          locationName: "278 rue de l'Arbalétrier, Champniers (16430)",
          latitude: 45.7006,
          longitude: 0.1957,
        })
      }
    })

    this.version(10).stores({
      diagnostics: 'id, problemEntryId, cropId, parcelId, treeId, status, createdAt, updatedAt',
    })

    this.version(11).stores({
      auditLog: 'id, type, date',
    })

    // Calendrier de semis : catalogue elargi a 22 legumes (etait limite aux 10
    // cultures de Mathieu) pour proposer des idees de semis/plantation au-dela
    // de ce qui est deja en place. bulkPut par id, n'efface rien d'existant.
    this.version(12).stores({}).upgrade(async (tx) => {
      await tx.table('catalog').bulkPut([
        { id: 'catalog-11', vegetable: 'Carotte', family: 'apiacees', sowingMonths: [3, 4, 5, 6, 7], harvestMonths: [6, 7, 8, 9, 10], daysToHarvest: 70, companions: ['Oignon', 'Poireau', 'Tomate'], antagonists: ['Aneth'] },
        { id: 'catalog-12', vegetable: 'Poireau', family: 'alliacees', sowingMonths: [2, 3], plantingMonths: [5, 6], harvestMonths: [9, 10, 11, 12, 1, 2], daysToHarvest: 150, companions: ['Carotte', 'Céleri'], antagonists: ['Haricot', 'Pois'] },
        { id: 'catalog-13', vegetable: 'Chou', family: 'brassicacees', sowingMonths: [3, 7], plantingMonths: [4, 5, 8, 9], harvestMonths: [6, 7, 11, 12, 1], daysToHarvest: 90, companions: ['Céleri'], antagonists: ['Fraise'] },
        { id: 'catalog-14', vegetable: 'Radis', family: 'brassicacees', sowingMonths: [3, 4, 5, 6, 7, 8, 9], harvestMonths: [4, 5, 6, 7, 8, 9, 10], daysToHarvest: 25, companions: ['Carotte', 'Laitue'], antagonists: [] },
        { id: 'catalog-15', vegetable: 'Laitue', family: 'asteracees', sowingMonths: [2, 3, 4, 5, 6, 7, 8, 9], plantingMonths: [3, 4, 5, 6, 7, 8, 9, 10], harvestMonths: [4, 5, 6, 7, 8, 9, 10, 11], daysToHarvest: 60, companions: ['Radis', 'Carotte'], antagonists: [] },
        { id: 'catalog-16', vegetable: 'Épinard', family: 'chenopodiacees', sowingMonths: [2, 3, 8, 9], harvestMonths: [4, 5, 10, 11], daysToHarvest: 45, companions: [], antagonists: [] },
        { id: 'catalog-17', vegetable: 'Betterave', family: 'chenopodiacees', sowingMonths: [4, 5, 6], harvestMonths: [7, 8, 9, 10], daysToHarvest: 90, companions: ['Oignon'], antagonists: [] },
        { id: 'catalog-18', vegetable: 'Petit pois', family: 'fabacees', sowingMonths: [2, 3, 4, 10], harvestMonths: [5, 6, 7], daysToHarvest: 80, companions: ['Carotte', 'Radis'], antagonists: ['Ail', 'Oignon'] },
        { id: 'catalog-19', vegetable: 'Fève', family: 'fabacees', sowingMonths: [2, 3, 10, 11], harvestMonths: [5, 6], daysToHarvest: 100, companions: ['Pomme de terre'], antagonists: ['Ail', 'Oignon'] },
        { id: 'catalog-20', vegetable: 'Poivron', family: 'solanacees', sowingMonths: [2, 3], plantingMonths: [5], harvestMonths: [7, 8, 9, 10], daysToHarvest: 90, companions: ['Basilic'], antagonists: ['Pomme de terre', 'Fenouil'] },
        { id: 'catalog-21', vegetable: 'Aubergine', family: 'solanacees', sowingMonths: [2, 3], plantingMonths: [5], harvestMonths: [7, 8, 9, 10], daysToHarvest: 90, companions: ['Haricot'], antagonists: ['Pomme de terre', 'Fenouil'] },
        { id: 'catalog-22', vegetable: 'Concombre', family: 'cucurbitacees', sowingMonths: [4, 5], plantingMonths: [5, 6], harvestMonths: [7, 8, 9], daysToHarvest: 60, companions: ['Haricot', 'Mais'], antagonists: ['Pomme de terre'] },
      ])
    })

    // Module Argent : axe recurrence (fixe/variable) distinct de l'amortissement.
    // Les depenses existantes sont ponctuelles par defaut. Backfill seul, schema
    // inchange (filtrage en memoire, pas d'index sur recurrence).
    this.version(13).stores({}).upgrade(async (tx) => {
      const rows = await tx.table('expenses').toArray()
      for (const row of rows) {
        if (row.recurrence == null) {
          await tx.table('expenses').update(row.id, { recurrence: 'ponctuelle' })
        }
      }
    })
  }
}

export const db = new PotagerDB()

export const newId = (): string => crypto.randomUUID()
