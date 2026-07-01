import type { Parcel, Crop, CatalogItem, WaterTank, GardenLogEntry } from '../data/model'
import type { DailyWeather } from './weatherService'
import { resolveRainMm } from './wateringComparisonService'
import { getHarvestReminders } from './reminderService'
import { summarizeTankAutonomy } from './tankAutonomyService'
import { getMonthPlan } from './calendarService'
import { entryParcelIds } from './logView'

export type AgendaItemKind =
  | 'alerte_gel'
  | 'cuve_basse'
  | 'arrosage'
  | 'recolte'
  | 'semis'
  | 'plantation'

export interface AgendaItem {
  kind: AgendaItemKind
  label: string
  detail?: string
  parcelId?: string
  cropId?: string
  priority: 1 | 2 | 3
}

export interface TodayAgendaInput {
  parcels: Parcel[]
  crops: Crop[]
  catalog: CatalogItem[]
  tanks: WaterTank[]
  log: GardenLogEntry[]
  today: string
  /** Historique météo 2-3 j (Open-Meteo). Absent = hors-ligne : les items météo sont omis. */
  weatherHistory?: DailyWeather[] | null
  /** Température minimale prévue aujourd'hui. Absent = hors-ligne. */
  todayTempMinC?: number
}

const RAIN_THRESHOLD_MM = 3
const WATERING_WINDOW_DAYS = 2
const MAX_ARROSAGE_ITEMS = 3

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24),
  )
}

/** Nombre de jours depuis le dernier arrosage connu d'une parcelle, null si jamais arrosée. */
function lastWateringDaysAgo(parcelId: string, log: GardenLogEntry[], today: string): number | null {
  const dates = log
    .filter((e) => e.type === 'arrosage' && entryParcelIds(e).includes(parcelId))
    .map((e) => e.date)
  if (dates.length === 0) return null
  const lastDate = dates.reduce((max, d) => (d > max ? d : max))
  return daysBetween(lastDate, today)
}

function arrosageJustification(parcel: Parcel, log: GardenLogEntry[], today: string, rain2d: number): string {
  const daysSince = lastWateringDaysAgo(parcel.id as string, log, today)
  const wateringPart = daysSince != null ? `Pas arrosé depuis ${daysSince} j` : 'Jamais arrosé'
  const rainPart = `pluie récente ${Math.round(rain2d * 10) / 10} mm`
  return `${wateringPart} · ${rainPart}`
}

export function getTodayAgenda(input: TodayAgendaInput): AgendaItem[] {
  const { parcels, crops, catalog, tanks, log, today, weatherHistory, todayTempMinC } = input
  const items: AgendaItem[] = []

  // Priorité 1 — Alerte gel (nécessite météo)
  if (todayTempMinC !== undefined && todayTempMinC < 2) {
    items.push({
      kind: 'alerte_gel',
      label: `Risque de gel cette nuit (${Math.round(todayTempMinC)} °C)`,
      detail: 'Protège tes plantations sensibles',
      priority: 1,
    })
  }

  // Priorité 1 — Cuve basse
  if (tanks.length > 0) {
    const { autonomyDays } = summarizeTankAutonomy(tanks, log, today)
    if (autonomyDays !== null && autonomyDays <= 3) {
      const plural = tanks.length > 1
      items.push({
        kind: 'cuve_basse',
        label: `Cuve${plural ? 's' : ''} bientôt vide${plural ? 's' : ''} (${autonomyDays} j)`,
        detail: 'Pense à remplir avant la pénurie',
        priority: 1,
      })
    }
  }

  // Priorité 2 — Arrosage (nécessite météo pour la pluie cumulée)
  if (weatherHistory !== undefined) {
    const rain2d = resolveRainMm(log, weatherHistory ?? null, today, WATERING_WINDOW_DAYS)

    if (rain2d < RAIN_THRESHOLD_MM) {
      const activeParcels = parcels.filter((p) =>
        crops.some(
          (c) =>
            c.parcelId === p.id &&
            (c.status === 'en_place' || c.status === 'en_recolte'),
        ),
      )

      const needWatering = activeParcels.filter(
        (parcel) =>
          !log.some((e) => {
            if (e.type !== 'arrosage' || !entryParcelIds(e).includes(parcel.id as string)) return false
            const ageDays = daysBetween(e.date, today)
            return ageDays >= 0 && ageDays <= WATERING_WINDOW_DAYS
          }),
      )

      const shown = needWatering.slice(0, MAX_ARROSAGE_ITEMS)
      const extra = needWatering.length - shown.length

      for (let i = 0; i < shown.length; i++) {
        const parcel = shown[i]
        const isLast = i === shown.length - 1
        let detail = arrosageJustification(parcel, log, today, rain2d)
        if (isLast && extra > 0) {
          detail += ` · et ${extra} autre${extra > 1 ? 's' : ''} parcelle${extra > 1 ? 's' : ''}`
        }
        items.push({
          kind: 'arrosage',
          label: `Arroser : ${parcel.name}`,
          detail,
          parcelId: parcel.id,
          priority: 2,
        })
      }
    }
  }

  // Priorité 2 — Récoltes mûres
  for (const r of getHarvestReminders(crops, catalog, log, today)) {
    items.push({
      kind: 'recolte',
      label: `Récolte : ${r.vegetable}`,
      detail: `${r.daysSinceReference} j depuis le ${r.referenceKind}`,
      cropId: r.crop.id,
      priority: 2,
    })
  }

  // Priorité 3 — Semis / plantations du mois calendaire
  const month = new Date(`${today}T00:00:00`).getMonth() + 1
  const gardenCatalogIds = new Set(
    crops.filter((c) => c.catalogId != null).map((c) => c.catalogId!),
  )
  const plan = getMonthPlan(catalog, month, gardenCatalogIds)

  for (const item of plan.toSow.slice(0, 3)) {
    items.push({
      kind: 'semis',
      label: `À semer ce mois : ${item.vegetable}`,
      priority: 3,
    })
  }

  for (const item of plan.toPlant.slice(0, 2)) {
    items.push({
      kind: 'plantation',
      label: `À planter ce mois : ${item.vegetable}`,
      priority: 3,
    })
  }

  return items.sort((a, b) => a.priority - b.priority)
}
