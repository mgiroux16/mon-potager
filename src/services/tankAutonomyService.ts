import type { GardenLogEntry, WaterTank } from '../data/model'
import { entryParcelIds } from './logView'

export interface TankAutonomySummary {
  totalCapacityLiters: number
  totalEstimatedLiters: number
  dailyAverageLiters: number
  autonomyDays: number | null
}

function daysBetween(from: string, to: string): number {
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24))
}

export function summarizeTankAutonomy(
  tanks: WaterTank[],
  entries: GardenLogEntry[],
  refDate: string,
): TankAutonomySummary {
  const totalCapacityLiters = tanks.reduce((sum, t) => sum + t.capacityLiters, 0)
  const totalEstimatedLiters = tanks.reduce((sum, t) => sum + (t.estimatedLiters ?? 0), 0)

  let liters7 = 0
  for (const e of entries) {
    if (e.type !== 'arrosage' || e.volumeLiters == null || entryParcelIds(e).length === 0) continue
    const ageDays = daysBetween(e.date, refDate)
    if (ageDays < 0 || ageDays > 7) continue
    liters7 += e.volumeLiters
  }
  const dailyAverageLiters = liters7 / 7

  const autonomyDays =
    dailyAverageLiters === 0 ? null : Math.round(totalEstimatedLiters / dailyAverageLiters)

  return { totalCapacityLiters, totalEstimatedLiters, dailyAverageLiters, autonomyDays }
}
