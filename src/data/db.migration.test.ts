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
  const catalogId = await legacy.table('catalog').add({ vegetable: 'Tomate', family: 'solanacees' })
  const varietyId = await legacy.table('varieties').add({ name: 'Saint-Pierre', vegetable: 'Tomate', catalogId })
  const cropId = await legacy.table('crops').add({
    name: 'Tomates',
    parcelId,
    catalogId,
    varietyId,
    status: 'en_place',
  })
  const oyaId = await legacy.table('oyas').add({
    name: 'Oya nord',
    parcelId,
    capacityLiters: 10,
    cropIds: [cropId],
  })
  await legacy.table('settings').add({ id: 1, locationName: 'Champniers', latitude: 0, longitude: 0 })
  await legacy.table('log').add({
    type: 'arrosage',
    date: '2026-06-01',
    parcelId,
    cropId,
    oyaId,
    varietyId,
    volumeLiters: 10,
    createdAt: 1,
  })

  legacy.close()
  return { parcelId, catalogId, varietyId, cropId, oyaId }
}

describe('migration UUID (v3 -> v4)', () => {
  it('convertit tous les ids numeriques en UUID et reecrit les relations', async () => {
    const legacyIds = await seedLegacyData()

    const upgraded = new PotagerDB()
    await upgraded.open()

    const parcels = await upgraded.parcels.toArray()
    const catalog = await upgraded.catalog.toArray()
    const varieties = await upgraded.varieties.toArray()
    const crops = await upgraded.crops.toArray()
    const oyas = await upgraded.oyas.toArray()
    const log = await upgraded.log.toArray()
    const settings = await upgraded.settings.toArray()

    expect(parcels).toHaveLength(1)
    expect(catalog).toHaveLength(1)
    expect(varieties).toHaveLength(1)
    expect(crops).toHaveLength(1)
    expect(oyas).toHaveLength(1)
    expect(log).toHaveLength(1)
    expect(settings).toHaveLength(1)

    // tous les ids sont desormais des UUID string, plus jamais les anciens numeriques.
    for (const row of [...parcels, ...catalog, ...varieties, ...crops, ...oyas, ...log]) {
      expect(typeof row.id).toBe('string')
      expect(row.id).not.toBe(String(legacyIds.parcelId))
    }
    expect(settings[0].id).toBe('settings')

    // les relations croisees pointent vers les nouveaux UUID, pas vers les anciens nombres.
    expect(crops[0].parcelId).toBe(parcels[0].id)
    expect(crops[0].catalogId).toBe(catalog[0].id)
    expect(crops[0].varietyId).toBe(varieties[0].id)
    expect(varieties[0].catalogId).toBe(catalog[0].id)
    expect(oyas[0].parcelId).toBe(parcels[0].id)
    expect(oyas[0].cropIds).toEqual([crops[0].id])
    expect(log[0].parcelId).toBe(parcels[0].id)
    expect(log[0].cropId).toBe(crops[0].id)
    expect(log[0].oyaId).toBe(oyas[0].id)
    expect(log[0].varietyId).toBe(varieties[0].id)

    upgraded.close()
  })

  it('ne perd aucune donnee quand la base legacy est vide', async () => {
    const legacy = new LegacyDB()
    await legacy.open()
    legacy.close()

    const upgraded = new PotagerDB()
    await upgraded.open()
    expect(await upgraded.parcels.count()).toBe(0)
    upgraded.close()
  })
})
