import type { GardenLogEntry } from '../data/model'
import type { DailyWeather } from './weatherService'

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
