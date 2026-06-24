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
} from './model'

export class PotagerDB extends Dexie {
  log!: Table<GardenLogEntry, number>
  parcels!: Table<Parcel, number>
  crops!: Table<Crop, number>
  oyas!: Table<Oya, number>
  trees!: Table<FruitTree, number>
  tanks!: Table<WaterTank, number>
  catalog!: Table<CatalogItem, number>
  expenses!: Table<Expense, number>
  soil!: Table<SoilNote, number>
  settings!: Table<AppSettings, number>

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
  }
}

export const db = new PotagerDB()
