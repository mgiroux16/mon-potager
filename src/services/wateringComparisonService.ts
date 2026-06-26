import type { GardenLogEntry, Parcel } from '../data/model'
import type { DailyWeather } from './weatherService'
import type { WaterUsageRow } from './waterUsageService'

function daysBetween(from: string, to: string): number {
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24))
}

export function resolveRainMm(
  entries: GardenLogEntry[],
  history: DailyWeather[] | null,
  refDate: string,
  windowDays: number,
): number {
  const manualReadings = entries.filter((e) => {
    if (e.type !== 'releve_pluie' || e.rainMm == null) return false
    const ageDays = daysBetween(e.date, refDate)
    return ageDays >= 0 && ageDays <= windowDays
  })

  if (manualReadings.length > 0) {
    return manualReadings.reduce((acc, e) => acc + (e.rainMm ?? 0), 0)
  }

  if (!history) return 0

  return history
    .filter((d) => {
      const ageDays = daysBetween(d.date, refDate)
      return ageDays >= 0 && ageDays <= windowDays
    })
    .reduce((acc, d) => acc + d.rainMm, 0)
}

export interface ParcelWateringComparison {
  parcelId: number
  parcelName: string
  liters7: number
  liters14: number
  liters30: number
  rainLiters7: number | null
  rainLiters14: number | null
  rainLiters30: number | null
  totalLiters7: number
  totalLiters14: number
  totalLiters30: number
}

export function compareWateringToRain(
  usage: WaterUsageRow[],
  parcels: Parcel[],
  rainMm7: number,
  rainMm14: number,
  rainMm30: number,
): ParcelWateringComparison[] {
  return usage.map((row) => {
    const parcel = parcels.find((p) => p.id === row.parcelId)
    const areaM2 = parcel?.areaM2

    const rainLiters7 = areaM2 != null ? rainMm7 * areaM2 : null
    const rainLiters14 = areaM2 != null ? rainMm14 * areaM2 : null
    const rainLiters30 = areaM2 != null ? rainMm30 * areaM2 : null

    return {
      parcelId: row.parcelId,
      parcelName: row.parcelName,
      liters7: row.liters7,
      liters14: row.liters14,
      liters30: row.liters30,
      rainLiters7,
      rainLiters14,
      rainLiters30,
      totalLiters7: row.liters7 + (rainLiters7 ?? 0),
      totalLiters14: row.liters14 + (rainLiters14 ?? 0),
      totalLiters30: row.liters30 + (rainLiters30 ?? 0),
    }
  })
}
