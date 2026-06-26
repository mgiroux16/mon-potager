import type { AppSettings, GardenLogEntry, Crop, Variety, Parcel, Expense } from '../data/model'

export interface SeasonBounds {
  start: string
  end: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function seasonBounds(year: number, settings: AppSettings): SeasonBounds {
  const startMonth = settings.seasonStartMonth
  const endMonth = settings.seasonEndMonth
  const lastDay = new Date(year, endMonth, 0).getDate()
  return {
    start: `${year}-${pad2(startMonth)}-01`,
    end: `${year}-${pad2(endMonth)}-${pad2(lastDay)}`,
  }
}

function inWindow(date: string, bounds: SeasonBounds): boolean {
  return date >= bounds.start && date <= bounds.end
}

export interface CropSeasonRow {
  cropId: number
  cropName: string
  varietyId?: number
  varietyName?: string
  parcelId?: number
  parcelName?: string
  year: number
  firstHarvestDate?: string
  lastHarvestDate?: string
  totalKg: number
  yieldPerPlantKg?: number
  yieldPerM2Kg?: number
  grossValueEuros?: number
  expensesEuros: number
  netEuros?: number
}

export function summarizeCropSeason(
  entries: GardenLogEntry[],
  crops: Crop[],
  varieties: Variety[],
  parcels: Parcel[],
  expenses: Expense[],
  year: number,
  settings: AppSettings,
): CropSeasonRow[] {
  const bounds = seasonBounds(year, settings)
  const byKey = new Map<string, CropSeasonRow>()

  function rowFor(cropId: number, varietyId: number | undefined): CropSeasonRow {
    const key = `${cropId}-${varietyId ?? 'none'}`
    const existing = byKey.get(key)
    if (existing) return existing

    const crop = crops.find((c) => c.id === cropId)
    const variety = varietyId != null ? varieties.find((v) => v.id === varietyId) : undefined
    const parcel = crop?.parcelId != null ? parcels.find((p) => p.id === crop.parcelId) : undefined

    const row: CropSeasonRow = {
      cropId,
      cropName: crop?.name ?? '(culture supprimée)',
      varietyId,
      varietyName: varietyId != null ? variety?.name ?? '(variété supprimée)' : 'non précisée',
      parcelId: crop?.parcelId,
      parcelName: parcel?.name,
      year,
      totalKg: 0,
      expensesEuros: 0,
    }
    byKey.set(key, row)
    return row
  }

  for (const e of entries) {
    if (e.type !== 'recolte' || e.quantityKg == null || e.cropId == null) continue
    if (!inWindow(e.date, bounds)) continue

    const row = rowFor(e.cropId, e.varietyId)
    row.totalKg += e.quantityKg
    if (row.firstHarvestDate == null || e.date < row.firstHarvestDate) row.firstHarvestDate = e.date
    if (row.lastHarvestDate == null || e.date > row.lastHarvestDate) row.lastHarvestDate = e.date
  }

  for (const exp of expenses) {
    if (exp.cropId == null || !inWindow(exp.date, bounds)) continue
    if (!crops.some((c) => c.id === exp.cropId)) continue
    const row = rowFor(exp.cropId, undefined)
    row.expensesEuros += exp.amountEuros
  }

  const rows = Array.from(byKey.values()).map((row) => {
    const crop = crops.find((c) => c.id === row.cropId)
    const parcel = row.parcelId != null ? parcels.find((p) => p.id === row.parcelId) : undefined

    const yieldPerPlantKg =
      crop?.plantCount != null && crop.plantCount > 0 ? row.totalKg / crop.plantCount : undefined
    const yieldPerM2Kg =
      parcel?.areaM2 != null && parcel.areaM2 > 0 ? row.totalKg / parcel.areaM2 : undefined
    const grossValueEuros = crop?.pricePerKg != null ? row.totalKg * crop.pricePerKg : undefined
    const netEuros = grossValueEuros != null ? grossValueEuros - row.expensesEuros : undefined

    return { ...row, yieldPerPlantKg, yieldPerM2Kg, grossValueEuros, netEuros }
  })

  return rows.sort((a, b) => a.cropName.localeCompare(b.cropName))
}
