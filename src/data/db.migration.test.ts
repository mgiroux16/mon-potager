import Dexie from 'dexie'
import { describe, it, expect, afterEach } from 'vitest'
import { PotagerDB } from './db'

const DB_NAME = 'mon-potager'

afterEach(async () => {
  await Dexie.delete(DB_NAME)
})

// Reproduit le schema pre-migration (versions 1 a 3, ids numeriques auto-increment)
// pour simuler une base existante sur l'appareil de Mathieu avant la mise a jour.
class LegacyDB extends Dexie {
  constructor() {
    super(DB_NAME)
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
  }
}

async function seedLegacyData() {
  const legacy = new LegacyDB()
  await legacy.open()

  const parcelId = await legacy.table('parcels').add({ name: 'Planche tomates', areaM2: 25 })
  await legacy.table('log').add({
    type: 'arrosage',
    date: '2026-06-01',
    parcelId,
    volumeLiters: 10,
    createdAt: 1,
  })

  legacy.close()
}

// Depuis le Lot 5 (demontage de la synchro maison), la version 14 supprime toutes
// les tables sauf auditLog : ces donnees vivent desormais uniquement dans Firestore
// (voir Lots 1 a 4). Ce test protege le chemin de migration complet pour un appareil
// qui n'a encore jamais ouvert l'app depuis ce demontage (legacy v1-v3 -> v14 d'un coup).
describe('migration complete jusqu a v14 (demontage synchro maison)', () => {
  it('ne perd pas et ne plante pas sur une base legacy, et ne garde que auditLog', async () => {
    await seedLegacyData()

    const upgraded = new PotagerDB()
    await upgraded.open()

    expect(upgraded.tables.map((t) => t.name)).toEqual(['auditLog'])
    expect(await upgraded.auditLog.count()).toBe(0)

    upgraded.close()
  })

  it('ne plante pas sur une base legacy vide', async () => {
    const legacy = new LegacyDB()
    await legacy.open()
    legacy.close()

    const upgraded = new PotagerDB()
    await upgraded.open()
    expect(upgraded.tables.map((t) => t.name)).toEqual(['auditLog'])
    upgraded.close()
  })
})
