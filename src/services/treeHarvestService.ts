import type { GardenLogEntry } from '../data/model'

function yearOf(date: string): number {
  return Number(date.slice(0, 4))
}

export function summarizeTreeHarvests(treeId: string, log: GardenLogEntry[]): Record<number, number> {
  const byYear: Record<number, number> = {}
  for (const e of log) {
    if (e.type !== 'recolte' || e.treeId !== treeId || e.quantityKg == null) continue
    const year = yearOf(e.date)
    byYear[year] = (byYear[year] ?? 0) + e.quantityKg
  }
  return byYear
}
