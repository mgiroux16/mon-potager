import type { GardenLogEntry, Crop } from '../data/model'

export interface HarvestRow {
  cropId: number
  cropName: string
  year: number
  totalKg: number
  pricePerKg?: number
  totalEuros?: number
}

function yearOf(date: string): number {
  return Number(date.slice(0, 4))
}

export function summarizeHarvests(entries: GardenLogEntry[], crops: Crop[]): HarvestRow[] {
  const byKey = new Map<string, HarvestRow>()

  for (const e of entries) {
    if (e.type !== 'recolte' || e.quantityKg == null || e.cropId == null) continue
    const year = yearOf(e.date)
    const key = `${e.cropId}-${year}`
    const crop = crops.find((c) => c.id === e.cropId)
    const cropName = crop?.name ?? '(culture supprimée)'

    const existing = byKey.get(key)
    if (existing) {
      existing.totalKg += e.quantityKg
    } else {
      byKey.set(key, {
        cropId: e.cropId,
        cropName,
        year,
        totalKg: e.quantityKg,
        pricePerKg: crop?.pricePerKg,
      })
    }
  }

  const rows = Array.from(byKey.values()).map((row) => ({
    ...row,
    totalEuros: row.pricePerKg != null ? row.totalKg * row.pricePerKg : undefined,
  }))

  return rows.sort((a, b) => a.cropName.localeCompare(b.cropName) || a.year - b.year)
}
