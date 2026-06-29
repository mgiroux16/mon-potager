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
  { id: 'parcel-1', name: 'Planche tomates', areaM2: 25, exposure: 'plein_soleil', soil: 'argilo-calcaire', mulch: 'BRF + paille' },
  { id: 'parcel-2', name: 'Rang pommes de terre', areaM2: 20, exposure: 'plein_soleil', soil: 'argilo-calcaire', mulch: 'paille' },
  { id: 'parcel-3', name: 'Buttes courges et courgettes', areaM2: 30, exposure: 'plein_soleil', soil: 'argilo-calcaire', mulch: 'BRF' },
  { id: 'parcel-4', name: 'Aromatiques et alliacées', areaM2: 15, exposure: 'mi_ombre', soil: 'argilo-calcaire', mulch: 'paille' },
]

export const seedTanks: WaterTank[] = [
  { id: 'tank-1', name: 'Cuve 1', capacityLiters: 1000, estimatedLiters: 300 },
  { id: 'tank-2', name: 'Cuve 2', capacityLiters: 1000, estimatedLiters: 300 },
  { id: 'tank-3', name: 'Cuve 3', capacityLiters: 1000, estimatedLiters: 250 },
  { id: 'tank-4', name: 'Cuve 4', capacityLiters: 1000, estimatedLiters: 200 },
  { id: 'tank-5', name: 'Cuve 5', capacityLiters: 1000, estimatedLiters: 200 },
]

export const seedCatalog: CatalogItem[] = [
  { id: 'catalog-1', vegetable: 'Tomate', family: 'solanacees', sowingMonths: [3, 4], plantingMonths: [5], harvestMonths: [7, 8, 9, 10], daysToHarvest: 70, companions: ['Basilic', 'Oeillet d\'Inde', 'Carotte'], antagonists: ['Pomme de terre', 'Fenouil'] },
  { id: 'catalog-2', vegetable: 'Pomme de terre', family: 'solanacees', plantingMonths: [3, 4], harvestMonths: [7, 8], daysToHarvest: 100, companions: ['Haricot', 'Chou'], antagonists: ['Tomate', 'Courge'] },
  { id: 'catalog-3', vegetable: 'Courgette', family: 'cucurbitacees', sowingMonths: [4, 5], plantingMonths: [5, 6], harvestMonths: [6, 7, 8, 9], daysToHarvest: 50, companions: ['Haricot', 'Mais'], antagonists: ['Pomme de terre'] },
  { id: 'catalog-4', vegetable: 'Courge', family: 'cucurbitacees', sowingMonths: [4, 5], plantingMonths: [5, 6], harvestMonths: [9, 10], daysToHarvest: 100, companions: ['Mais', 'Haricot'], antagonists: ['Pomme de terre'] },
  { id: 'catalog-5', vegetable: 'Patisson', family: 'cucurbitacees', sowingMonths: [4, 5], plantingMonths: [5, 6], harvestMonths: [8, 9, 10], daysToHarvest: 70, companions: ['Mais', 'Haricot'], antagonists: ['Pomme de terre'] },
  { id: 'catalog-6', vegetable: 'Haricot à rames', family: 'fabacees', sowingMonths: [5, 6], harvestMonths: [7, 8, 9], daysToHarvest: 70, companions: ['Mais', 'Courgette'], antagonists: ['Ail', 'Oignon'] },
  { id: 'catalog-7', vegetable: 'Oignon', family: 'alliacees', plantingMonths: [3, 4], harvestMonths: [7, 8], daysToHarvest: 120, companions: ['Carotte', 'Betterave'], antagonists: ['Haricot', 'Pois'] },
  { id: 'catalog-8', vegetable: 'Ail', family: 'alliacees', plantingMonths: [10, 11], harvestMonths: [6, 7], daysToHarvest: 240, companions: ['Tomate', 'Carotte'], antagonists: ['Haricot', 'Pois'] },
  { id: 'catalog-9', vegetable: 'Échalote', family: 'alliacees', plantingMonths: [2, 3], harvestMonths: [6, 7], daysToHarvest: 130, companions: ['Carotte'], antagonists: ['Haricot', 'Pois'] },
  { id: 'catalog-10', vegetable: 'Patate douce', family: 'autres', plantingMonths: [5, 6], harvestMonths: [10], daysToHarvest: 120, companions: [], antagonists: [] },
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
]

export const seedCrops: Crop[] = [
  { id: 'crop-1', name: 'Tomates', parcelId: 'parcel-1', catalogId: 'catalog-1', status: 'en_place', waterNeed: 'eleve', notes: '~100 pieds, dont 30 aux oyas' },
  { id: 'crop-2', name: 'Pommes de terre Agata', variety: 'Agata', varietyId: 'variety-1', parcelId: 'parcel-2', catalogId: 'catalog-2', status: 'en_place', waterNeed: 'moyen', notes: '20 m linéaires' },
  { id: 'crop-3', name: 'Courgettes', parcelId: 'parcel-3', catalogId: 'catalog-3', status: 'en_place', waterNeed: 'eleve' },
  { id: 'crop-4', name: 'Courges', parcelId: 'parcel-3', catalogId: 'catalog-4', status: 'en_place', waterNeed: 'moyen' },
  { id: 'crop-5', name: 'Patisson', parcelId: 'parcel-3', catalogId: 'catalog-5', status: 'en_place', waterNeed: 'moyen' },
  { id: 'crop-6', name: 'Haricots à rames', parcelId: 'parcel-3', catalogId: 'catalog-6', status: 'en_place', waterNeed: 'moyen' },
  { id: 'crop-7', name: 'Oignons', parcelId: 'parcel-4', catalogId: 'catalog-7', status: 'en_place', waterNeed: 'faible' },
  { id: 'crop-8', name: 'Ail', parcelId: 'parcel-4', catalogId: 'catalog-8', status: 'en_place', waterNeed: 'faible' },
  { id: 'crop-9', name: 'Échalotes', parcelId: 'parcel-4', catalogId: 'catalog-9', status: 'en_place', waterNeed: 'faible' },
  { id: 'crop-10', name: 'Patate douce', parcelId: 'parcel-3', catalogId: 'catalog-10', status: 'en_place', waterNeed: 'moyen' },
]

export const seedTrees: FruitTree[] = [
  { id: 'tree-1', name: 'Pommier Belchard', variety: 'Belchard', waterNeed: 'moyen' },
  { id: 'tree-2', name: 'Pommier Red Delicious', variety: 'Red Delicious', waterNeed: 'moyen' },
  { id: 'tree-3', name: 'Pêcher plat (1)', variety: 'pêche plate', waterNeed: 'moyen' },
  { id: 'tree-4', name: 'Pêcher plat (2)', variety: 'pêche plate', waterNeed: 'moyen' },
  { id: 'tree-5', name: 'Prunabricotier hybride', variety: 'hybride prune-abricot', waterNeed: 'moyen' },
  { id: 'tree-6', name: 'Poirier Williams', variety: 'Williams', waterNeed: 'moyen' },
  { id: 'tree-7', name: 'Poirier portugais', variety: 'portugais', waterNeed: 'moyen' },
  { id: 'tree-8', name: 'Nectarinier portugais', variety: 'portugais', waterNeed: 'moyen' },
]

export const seedVarieties: Variety[] = [
  { id: 'variety-1', name: 'Agata', vegetable: 'Pomme de terre', catalogId: 'catalog-2' },
]

export const seedOyas: Oya[] = [
  { id: 'oya-1', name: 'Oyas tomates A', parcelId: 'parcel-1', capacityLiters: 10, currentLiters: 6, cropIds: ['crop-1'] },
  { id: 'oya-2', name: 'Oyas tomates B', parcelId: 'parcel-1', capacityLiters: 10, currentLiters: 4, cropIds: ['crop-1'] },
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
