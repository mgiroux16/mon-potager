import { db, type PotagerDB } from './db'
import { DEFAULT_SETTINGS } from '../services/settingsService'
import type {
  Parcel,
  Crop,
  FruitTree,
  WaterTank,
  Oya,
  CatalogItem,
  Variety,
} from './model'

export const seedParcels: Parcel[] = [
  { id: 1, name: 'Planche tomates', areaM2: 25, exposure: 'plein_soleil', soil: 'argilo-calcaire', mulch: 'BRF + paille' },
  { id: 2, name: 'Rang pommes de terre', areaM2: 20, exposure: 'plein_soleil', soil: 'argilo-calcaire', mulch: 'paille' },
  { id: 3, name: 'Buttes courges et courgettes', areaM2: 30, exposure: 'plein_soleil', soil: 'argilo-calcaire', mulch: 'BRF' },
  { id: 4, name: 'Aromatiques et alliacées', areaM2: 15, exposure: 'mi_ombre', soil: 'argilo-calcaire', mulch: 'paille' },
]

export const seedTanks: WaterTank[] = [
  { id: 1, name: 'Cuve 1', capacityLiters: 1000, estimatedLiters: 300 },
  { id: 2, name: 'Cuve 2', capacityLiters: 1000, estimatedLiters: 300 },
  { id: 3, name: 'Cuve 3', capacityLiters: 1000, estimatedLiters: 250 },
  { id: 4, name: 'Cuve 4', capacityLiters: 1000, estimatedLiters: 200 },
  { id: 5, name: 'Cuve 5', capacityLiters: 1000, estimatedLiters: 200 },
]

export const seedCatalog: CatalogItem[] = [
  { id: 1, vegetable: 'Tomate', family: 'solanacees', sowingMonths: [3, 4], plantingMonths: [5], harvestMonths: [7, 8, 9, 10], daysToHarvest: 70, companions: ['Basilic', 'Oeillet d\'Inde', 'Carotte'], antagonists: ['Pomme de terre', 'Fenouil'] },
  { id: 2, vegetable: 'Pomme de terre', family: 'solanacees', plantingMonths: [3, 4], harvestMonths: [7, 8], daysToHarvest: 100, companions: ['Haricot', 'Chou'], antagonists: ['Tomate', 'Courge'] },
  { id: 3, vegetable: 'Courgette', family: 'cucurbitacees', sowingMonths: [4, 5], plantingMonths: [5, 6], harvestMonths: [6, 7, 8, 9], daysToHarvest: 50, companions: ['Haricot', 'Mais'], antagonists: ['Pomme de terre'] },
  { id: 4, vegetable: 'Courge', family: 'cucurbitacees', sowingMonths: [4, 5], plantingMonths: [5, 6], harvestMonths: [9, 10], daysToHarvest: 100, companions: ['Mais', 'Haricot'], antagonists: ['Pomme de terre'] },
  { id: 5, vegetable: 'Patisson', family: 'cucurbitacees', sowingMonths: [4, 5], plantingMonths: [5, 6], harvestMonths: [8, 9, 10], daysToHarvest: 70, companions: ['Mais', 'Haricot'], antagonists: ['Pomme de terre'] },
  { id: 6, vegetable: 'Haricot à rames', family: 'fabacees', sowingMonths: [5, 6], harvestMonths: [7, 8, 9], daysToHarvest: 70, companions: ['Mais', 'Courgette'], antagonists: ['Ail', 'Oignon'] },
  { id: 7, vegetable: 'Oignon', family: 'alliacees', plantingMonths: [3, 4], harvestMonths: [7, 8], daysToHarvest: 120, companions: ['Carotte', 'Betterave'], antagonists: ['Haricot', 'Pois'] },
  { id: 8, vegetable: 'Ail', family: 'alliacees', plantingMonths: [10, 11], harvestMonths: [6, 7], daysToHarvest: 240, companions: ['Tomate', 'Carotte'], antagonists: ['Haricot', 'Pois'] },
  { id: 9, vegetable: 'Échalote', family: 'alliacees', plantingMonths: [2, 3], harvestMonths: [6, 7], daysToHarvest: 130, companions: ['Carotte'], antagonists: ['Haricot', 'Pois'] },
  { id: 10, vegetable: 'Patate douce', family: 'autres', plantingMonths: [5, 6], harvestMonths: [10], daysToHarvest: 120, companions: [], antagonists: [] },
]

export const seedCrops: Crop[] = [
  { id: 1, name: 'Tomates', parcelId: 1, catalogId: 1, status: 'en_place', waterNeed: 'eleve', notes: '~100 pieds, dont 30 aux oyas' },
  { id: 2, name: 'Pommes de terre Agata', variety: 'Agata', varietyId: 1, parcelId: 2, catalogId: 2, status: 'en_place', waterNeed: 'moyen', notes: '20 m linéaires' },
  { id: 3, name: 'Courgettes', parcelId: 3, catalogId: 3, status: 'en_place', waterNeed: 'eleve' },
  { id: 4, name: 'Courges', parcelId: 3, catalogId: 4, status: 'en_place', waterNeed: 'moyen' },
  { id: 5, name: 'Patisson', parcelId: 3, catalogId: 5, status: 'en_place', waterNeed: 'moyen' },
  { id: 6, name: 'Haricots à rames', parcelId: 3, catalogId: 6, status: 'en_place', waterNeed: 'moyen' },
  { id: 7, name: 'Oignons', parcelId: 4, catalogId: 7, status: 'en_place', waterNeed: 'faible' },
  { id: 8, name: 'Ail', parcelId: 4, catalogId: 8, status: 'en_place', waterNeed: 'faible' },
  { id: 9, name: 'Échalotes', parcelId: 4, catalogId: 9, status: 'en_place', waterNeed: 'faible' },
  { id: 10, name: 'Patate douce', parcelId: 3, catalogId: 10, status: 'en_place', waterNeed: 'moyen' },
]

export const seedTrees: FruitTree[] = [
  { id: 1, name: 'Pommier Belchard', variety: 'Belchard', waterNeed: 'moyen' },
  { id: 2, name: 'Pommier Red Delicious', variety: 'Red Delicious', waterNeed: 'moyen' },
  { id: 3, name: 'Pêcher plat (1)', variety: 'pêche plate', waterNeed: 'moyen' },
  { id: 4, name: 'Pêcher plat (2)', variety: 'pêche plate', waterNeed: 'moyen' },
  { id: 5, name: 'Prunabricotier hybride', variety: 'hybride prune-abricot', waterNeed: 'moyen' },
  { id: 6, name: 'Poirier Williams', variety: 'Williams', waterNeed: 'moyen' },
  { id: 7, name: 'Poirier portugais', variety: 'portugais', waterNeed: 'moyen' },
  { id: 8, name: 'Nectarinier portugais', variety: 'portugais', waterNeed: 'moyen' },
]

export const seedVarieties: Variety[] = [
  { id: 1, name: 'Agata', vegetable: 'Pomme de terre', catalogId: 2 },
]

export const seedOyas: Oya[] = [
  { id: 1, name: 'Oyas tomates A', parcelId: 1, capacityLiters: 10, currentLiters: 6, cropIds: [1] },
  { id: 2, name: 'Oyas tomates B', parcelId: 1, capacityLiters: 10, currentLiters: 4, cropIds: [1] },
]

// Idempotent : ne fait rien si des données existent déjà.
export async function seedDatabase(database: PotagerDB = db): Promise<void> {
  const already = await database.parcels.count()
  if (already > 0) return

  await database.transaction(
    'rw',
    [
      database.settings,
      database.tanks,
      database.parcels,
      database.catalog,
      database.crops,
      database.trees,
      database.oyas,
      database.varieties,
    ],
    async () => {
      await database.settings.put(DEFAULT_SETTINGS)
      await database.tanks.bulkPut(seedTanks)
      await database.parcels.bulkPut(seedParcels)
      await database.catalog.bulkPut(seedCatalog)
      await database.varieties.bulkPut(seedVarieties)
      await database.crops.bulkPut(seedCrops)
      await database.trees.bulkPut(seedTrees)
      await database.oyas.bulkPut(seedOyas)
    },
  )
}
