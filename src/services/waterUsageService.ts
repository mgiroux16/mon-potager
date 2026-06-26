import type { GardenLogEntry, Parcel } from '../data/model'

export interface WaterUsageRow {
  parcelId: number
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
  const byParcel = new Map<number, WaterUsageRow>()
  const refYear = yearOf(refDate)

  for (const e of entries) {
    if (e.type !== 'arrosage' || e.volumeLiters == null || e.parcelId == null) continue

    const ageDays = daysBetween(e.date, refDate)
    if (ageDays < 0) continue

    const parcel = parcels.find((p) => p.id === e.parcelId)
    const parcelName = parcel?.name ?? '(parcelle supprimée)'

    let row = byParcel.get(e.parcelId)
    if (!row) {
      row = {
        parcelId: e.parcelId,
        parcelName,
        liters7: 0,
        liters14: 0,
        liters30: 0,
        litersYear: 0,
      }
      byParcel.set(e.parcelId, row)
    }

    if (ageDays <= 7) row.liters7 += e.volumeLiters
    if (ageDays <= 14) row.liters14 += e.volumeLiters
    if (ageDays <= 30) row.liters30 += e.volumeLiters
    if (yearOf(e.date) === refYear) row.litersYear += e.volumeLiters
  }

  return Array.from(byParcel.values()).sort((a, b) => a.parcelName.localeCompare(b.parcelName))
}
