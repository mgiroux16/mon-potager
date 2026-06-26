import type {
  Crop,
  FruitTree,
  GardenLogEntry,
  LogEntryType,
  Oya,
  Parcel,
  WeatherSnapshot,
} from '../data/model'

export interface LogRefs {
  parcels: Map<number, Parcel>
  crops: Map<number, Crop>
  oyas: Map<number, Oya>
  trees: Map<number, FruitTree>
}

export interface LogEntryView {
  typeLabel: string
  target?: string
  detail?: string
}

export const LOG_TYPE_LABELS: Record<LogEntryType, string> = {
  arrosage: 'Arrosage',
  remplissage_oya: "Remplissage d'oya",
  releve_pluie: 'Relevé de pluie',
  recolte: 'Récolte',
  semis: 'Semis',
  plantation: 'Plantation',
  paillage: 'Paillage',
  traitement: 'Traitement',
  observation: 'Observation',
  probleme: 'Problème',
  compost: 'Compost',
  taille: 'Taille',
  depense: 'Dépense',
  diagnostic: 'Diagnostic',
  note: 'Note',
}

// Pick<...> plutot que GardenLogEntry entier : ces deux helpers servent aussi a resumer
// un brouillon vocal partiel (VoiceReviewPage), pas seulement une entree deja en base.
export type TargetFields = Pick<GardenLogEntry, 'parcelId' | 'cropId' | 'oyaId' | 'treeId'>

export function resolveTargetName(entry: TargetFields, refs: LogRefs): string | undefined {
  if (entry.parcelId != null) return refs.parcels.get(entry.parcelId)?.name
  if (entry.cropId != null) return refs.crops.get(entry.cropId)?.name
  if (entry.oyaId != null) return refs.oyas.get(entry.oyaId)?.name
  if (entry.treeId != null) return refs.trees.get(entry.treeId)?.name
  return undefined
}

export type DetailFields = Pick<
  GardenLogEntry,
  'volumeLiters' | 'quantityKg' | 'rainMm' | 'description' | 'title'
>

export function resolveDetail(entry: DetailFields): string | undefined {
  if (entry.volumeLiters != null) return `${entry.volumeLiters} L`
  if (entry.quantityKg != null) return `${entry.quantityKg} kg`
  if (entry.rainMm != null) return `${entry.rainMm} mm`
  return entry.description ?? entry.title
}

export function describeLogEntry(entry: GardenLogEntry, refs: LogRefs): LogEntryView {
  return {
    typeLabel: LOG_TYPE_LABELS[entry.type],
    target: resolveTargetName(entry, refs),
    detail: resolveDetail(entry),
  }
}

export function formatLogDate(entry: GardenLogEntry, now: Date): string {
  const [y, m, d] = entry.date.split('-').map(Number)
  const entryDay = new Date(y, m - 1, d)
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((todayDay.getTime() - entryDay.getTime()) / 86_400_000)
  if (diffDays === 0) return entry.time ? `aujourd'hui ${entry.time}` : "aujourd'hui"
  if (diffDays === 1) return 'hier'
  if (diffDays >= 2 && diffDays <= 7) return `il y a ${diffDays} j`
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

export function formatSnapshotTemp(weather: WeatherSnapshot | undefined): string | null {
  if (!weather) return null
  const t = weather.tempC ?? weather.tempMaxC
  if (t == null) return null
  return `${Math.round(t)} °C`
}
