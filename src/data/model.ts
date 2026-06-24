// Modèle de données unifié de la PWA Mon Potager.
// Règle : le journal (GardenLogEntry) est l'unique registre d'événements.
// Arrosages, pluie, récoltes, dépenses = des vues filtrées de ce journal.

export type ISODate = string // 'YYYY-MM-DD'
export type ISOTime = string // 'HH:mm'
export type WaterNeed = 'faible' | 'moyen' | 'eleve'

export type LogEntryType =
  | 'arrosage'
  | 'remplissage_oya'
  | 'releve_pluie'
  | 'recolte'
  | 'semis'
  | 'plantation'
  | 'paillage'
  | 'traitement'
  | 'observation'
  | 'probleme'
  | 'compost'
  | 'taille'
  | 'depense'
  | 'diagnostic'
  | 'note'

export interface GardenLogEntry {
  id?: number
  type: LogEntryType
  date: ISODate
  time?: ISOTime
  title?: string
  description?: string
  parcelId?: number
  cropId?: number
  oyaId?: number
  treeId?: number
  volumeLiters?: number
  rainMm?: number
  quantityKg?: number
  expenseId?: number
  photoUrls?: string[]
  createdAt: number // epoch ms, pour trier de façon stable
}

export type Exposure = 'plein_soleil' | 'mi_ombre' | 'ombre'

export interface Parcel {
  id?: number
  name: string
  areaM2?: number
  exposure?: Exposure
  soil?: string
  mulch?: string
  notes?: string
  photoUrl?: string
}

export type CropStatus = 'prevu' | 'en_place' | 'en_recolte' | 'termine'

export interface Crop {
  id?: number
  name: string
  variety?: string
  parcelId?: number
  catalogId?: number
  sowingDate?: ISODate
  plantingDate?: ISODate
  harvestDate?: ISODate
  status: CropStatus
  waterNeed?: WaterNeed
  notes?: string
}

export interface Oya {
  id?: number
  name: string
  parcelId?: number
  capacityLiters: number
  currentLiters?: number
  cropIds?: number[]
}

export interface FruitTree {
  id?: number
  name: string
  variety?: string
  parcelId?: number
  shadeImpact?: string
  waterNeed?: WaterNeed
  notes?: string
}

export interface WaterTank {
  id?: number
  name: string
  capacityLiters: number
  estimatedLiters?: number
}

export type VegetableFamily =
  | 'solanacees'
  | 'cucurbitacees'
  | 'fabacees'
  | 'brassicacees'
  | 'alliacees'
  | 'apiacees'
  | 'asteracees'
  | 'chenopodiacees'
  | 'autres'

export interface CatalogItem {
  id?: number
  vegetable: string
  family: VegetableFamily
  sowingMonths?: number[] // 1-12
  plantingMonths?: number[]
  harvestMonths?: number[]
  companions?: string[]
  antagonists?: string[]
  notes?: string
}

export type ExpenseAmortization = 'consommable' | 'etale' | 'durable'

export interface Expense {
  id?: number
  label: string
  amountEuros: number
  date: ISODate
  amortization: ExpenseAmortization
  lifespanYears?: number // pour 'durable'
  usagePeriodMonths?: number // pour 'etale'
  category?: string
  parcelId?: number
  cropId?: number
}

export interface SoilNote {
  id?: number
  date: ISODate
  parcelId?: number
  kind: 'apport' | 'brf' | 'paillage' | 'compost' | 'observation'
  description?: string
}

export interface AppSettings {
  id?: number // singleton, toujours id = 1
  locationName: string
  latitude: number
  longitude: number
  frostThresholdC: number
  significantRainMm: number
  heatThresholdC: number
  defaultWateringFlowLh: number
  totalTankCapacityLiters: number
  aiLevel: 'aucune' | 'photo' | 'photo_assistant'
}
