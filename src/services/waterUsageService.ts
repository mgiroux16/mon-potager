import type { GardenLogEntry, Parcel } from '../data/model'
import { entryParcelIds } from './logView'

export interface WaterUsageRow {
  parcelId: string
  parcelName: string
  liters7: number
  liters14: number
  liters30: number
  litersYear: number
}

function daysBetween(from: string, to: string): number {
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24))
}

function yearOf(date: string): string {
  return date.slice(0, 4)
}

export function summarizeWaterUsage(
  entries: GardenLogEntry[],
  parcels: Parcel[],
  refDate: string,
): WaterUsageRow[] {
  const byParcel = new Map<string, WaterUsageRow>()
  const refYear = yearOf(refDate)

  for (const e of entries) {
    if (e.type !== 'arrosage' || e.volumeLiters == null) continue
    const ids = entryParcelIds(e)
    if (ids.length === 0) continue

    const ageDays = daysBetween(e.date, refDate)
    if (ageDays < 0) continue

    // Répartition égale entre les parcelles jointes (goutte-à-goutte commun, pas de
    // débitmètre par parcelle) : le total reste cohérent, sans double comptage. À raffiner
    // le jour où une vraie répartition (débitmètre) est disponible.
    const share = e.volumeLiters / ids.length

    for (const parcelId of ids) {
      const parcel = parcels.find((p) => p.id === parcelId)
      const parcelName = parcel?.name ?? '(parcelle supprimée)'

      let row = byParcel.get(parcelId)
      if (!row) {
        row = {
          parcelId,
          parcelName,
          liters7: 0,
          liters14: 0,
          liters30: 0,
          litersYear: 0,
        }
        byParcel.set(parcelId, row)
      }

      if (ageDays <= 7) row.liters7 += share
      if (ageDays <= 14) row.liters14 += share
      if (ageDays <= 30) row.liters30 += share
      if (yearOf(e.date) === refYear) row.litersYear += share
    }
  }

  return Array.from(byParcel.values()).sort((a, b) => a.parcelName.localeCompare(b.parcelName))
}
