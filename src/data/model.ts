// Modèle de données unifié de la PWA Mon Potager.
// Règle : le journal (GardenLogEntry) est l'unique registre d'événements.
// Arrosages, pluie, récoltes, dépenses = des vues filtrées de ce journal.

export type ISODate = string // 'YYYY-MM-DD'
export type ISOTime = string // 'HH:mm'
export type WaterNeed = 'faible' | 'moyen' | 'eleve'

export type EntryStatus = 'brouillon' | 'valide'

export interface WeatherSnapshot {
  capturedAt: number // epoch ms
  tempC?: number
  tempMinC?: number
  tempMaxC?: number
  rainMm?: number
  source: 'open-meteo' | 'manuel'
}

export const LOG_ENTRY_TYPES = [
  'arrosage',
  'remplissage_oya',
  'releve_pluie',
  'recolte',
  'semis',
  'plantation',
  'paillage',
  'traitement',
  'observation',
  'probleme',
  'compost',
  'taille',
  'depense',
  'diagnostic',
  'note',
  'floraison',
  'nouaison',
  'chute_fruits',
] as const

export type LogEntryType = (typeof LOG_ENTRY_TYPES)[number]

export interface GardenLogEntry {
  id?: string
  type: LogEntryType
  date: ISODate
  time?: ISOTime
  title?: string
  description?: string
  parcelId?: string
  cropId?: string
  oyaId?: string
  treeId?: string
  varietyId?: string
  status?: EntryStatus
  sourcePhrase?: string // la phrase naturelle d'origine, si saisie vocale/IA
  weather?: WeatherSnapshot // snapshot figé, rempli au palier 4b
  volumeLiters?: number
  rainMm?: number
  quantityKg?: number
  durationMinutes?: number // durée d'arrosage en minutes, informatif, jamais utilisé pour un calcul
  expenseId?: string
  photoUrls?: string[]
  createdAt: number // epoch ms, pour trier de façon stable
  updatedAt?: number // epoch ms, mis a jour automatiquement par les hooks Dexie
  deletedAt?: number // epoch ms, presence = supprime logiquement (tombstone)
}

export type Exposure = 'plein_soleil' | 'mi_ombre' | 'ombre'

export interface Parcel {
  id?: string
  name: string
  areaM2?: number
  exposure?: Exposure
  soil?: string
  mulch?: string
  notes?: string
  photoUrl?: string
  polygon?: { x: number; y: number }[] // coordonnees relatives 0-1 sur photoUrl, vide/absent = pas de zone tracee
  // Carte d'ensemble en grille (style Potabook) : position/taille en cellules, absent = pas encore placee
  mapX?: number
  mapY?: number
  mapWidth?: number
  mapHeight?: number
  mapRotation?: 0 | 90 | 180 | 270
  updatedAt?: number // epoch ms, mis a jour automatiquement par les hooks Dexie
  deletedAt?: number // epoch ms, presence = supprime logiquement (tombstone)
}

export type CropStatus = 'prevu' | 'en_place' | 'en_recolte' | 'termine'

export interface Crop {
  id?: string
  name: string
  variety?: string
  parcelId?: string
  catalogId?: string
  varietyId?: string
  plantCount?: number
  sowingDate?: ISODate
  plantingDate?: ISODate
  harvestDate?: ISODate
  status: CropStatus
  waterNeed?: WaterNeed
  notes?: string
  pricePerKg?: number // € au kg, saisi manuellement par Mathieu (marché/magasin)
  updatedAt?: number // epoch ms, mis a jour automatiquement par les hooks Dexie
  deletedAt?: number // epoch ms, presence = supprime logiquement (tombstone)
}

export interface Variety {
  id?: string
  name: string // ex : 'Saint-Pierre'
  vegetable: string // ex : 'Tomate' (lien logique vers le catalogue)
  catalogId?: string // lien dur vers CatalogItem si présent
  source?: string // semencier, échange, ferme...
  notes?: string
  updatedAt?: number // epoch ms, mis a jour automatiquement par les hooks Dexie
  deletedAt?: number // epoch ms, presence = supprime logiquement (tombstone)
}

export interface Oya {
  id?: string
  name: string
  parcelId?: string
  capacityLiters: number
  currentLiters?: number
  cropIds?: string[]
  updatedAt?: number // epoch ms, mis a jour automatiquement par les hooks Dexie
  deletedAt?: number // epoch ms, presence = supprime logiquement (tombstone)
}

export interface FruitTree {
  id?: string
  name: string
  variety?: string
  parcelId?: string
  shadeImpact?: string
  waterNeed?: WaterNeed
  notes?: string
  updatedAt?: number // epoch ms, mis a jour automatiquement par les hooks Dexie
  deletedAt?: number // epoch ms, presence = supprime logiquement (tombstone)
}

export interface WaterTank {
  id?: string
  name: string
  capacityLiters: number
  estimatedLiters?: number
  updatedAt?: number // epoch ms, mis a jour automatiquement par les hooks Dexie
  deletedAt?: number // epoch ms, presence = supprime logiquement (tombstone)
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
  id?: string
  vegetable: string
  family: VegetableFamily
  sowingMonths?: number[] // 1-12
  plantingMonths?: number[]
  harvestMonths?: number[]
  daysToHarvest?: number // jours depuis semis (si sowingMonths) ou plantation, jusqu'a recolte possible
  companions?: string[]
  antagonists?: string[]
  notes?: string
  updatedAt?: number // epoch ms, mis a jour automatiquement par les hooks Dexie
  deletedAt?: number // epoch ms, presence = supprime logiquement (tombstone)
}

export type ExpenseAmortization = 'consommable' | 'etale' | 'durable'

// Axe orthogonal a l'amortissement : une depense revient-elle (abonnement, eau,
// electricite, location) ou est-elle ponctuelle (graines, terreau, materiel) ?
// Ne jamais fusionner recurrence et amortization en un seul menu (cf. audit 1C).
export type ExpenseRecurrence = 'ponctuelle' | 'recurrente'
export type ExpensePeriodicity = 'mensuelle' | 'annuelle'

export interface Expense {
  id?: string
  label: string
  amountEuros: number
  date: ISODate
  amortization: ExpenseAmortization
  lifespanYears?: number // pour 'durable'
  usagePeriodMonths?: number // pour 'etale'
  recurrence?: ExpenseRecurrence // defaut 'ponctuelle' (backfill migration v13)
  periodicity?: ExpensePeriodicity // si recurrente : montant mensuel ou annuel
  category?: string
  parcelId?: string
  cropId?: string
  updatedAt?: number // epoch ms, mis a jour automatiquement par les hooks Dexie
  deletedAt?: number // epoch ms, presence = supprime logiquement (tombstone)
}

export interface SoilNote {
  id?: string
  date: ISODate
  parcelId?: string
  kind: 'apport' | 'brf' | 'paillage' | 'compost' | 'observation'
  description?: string
  updatedAt?: number // epoch ms, mis a jour automatiquement par les hooks Dexie
  deletedAt?: number // epoch ms, presence = supprime logiquement (tombstone)
}

export interface AppSettings {
  id?: string // singleton, toujours id = 'settings'
  locationName: string
  latitude: number
  longitude: number
  frostThresholdC: number
  significantRainMm: number
  heatThresholdC: number
  defaultWateringFlowLh: number
  totalTankCapacityLiters: number
  aiLevel: 'aucune' | 'photo' | 'photo_assistant'
  geminiApiKey?: string // clé API Gemini, stockée sur l'appareil ; vide par défaut
  seasonStartMonth: number // 1-12, mois de debut de la saison de culture, ex: 3 pour mars
  seasonEndMonth: number // 1-12, mois de fin de la saison de culture, ex: 11 pour novembre
  updatedAt?: number // epoch ms, mis a jour automatiquement par les hooks Dexie
  deletedAt?: number // epoch ms, presence = supprime logiquement (tombstone)
}

export interface SeasonNote {
  id?: string
  year: number
  cropId?: string
  parcelId?: string
  treeId?: string
  text: string
  updatedAt?: number // epoch ms, mis a jour automatiquement par les hooks Dexie
  deletedAt?: number // epoch ms, presence = supprime logiquement (tombstone)
}

export type HypothesisConfidence = 'faible' | 'moyen' | 'eleve'

export interface DiagnosticHypothesis {
  text: string
  indices: string
  confidence: HypothesisConfidence
  suggestedTreatment?: string
}

export type DiagnosticStatus = 'ouvert' | 'clos'

export interface Diagnostic {
  id?: string
  problemEntryId: string
  cropId?: string
  parcelId?: string
  treeId?: string
  createdAt: number // epoch ms
  hypotheses: DiagnosticHypothesis[]
  chosenAction?: string
  result?: string
  conclusion?: string
  status: DiagnosticStatus
  updatedAt?: number // epoch ms, mis a jour automatiquement par les hooks Dexie
  deletedAt?: number // epoch ms, presence = supprime logiquement (tombstone)
}

export type AuditLogType = 'export-json' | 'export-csv' | 'import'

export interface AuditLogEntry {
  id?: string
  type: AuditLogType
  date: number // epoch ms
  label: string
  recordCount: number
}
