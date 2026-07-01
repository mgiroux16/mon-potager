import type { AppSettings, GardenLogEntry, Crop, Variety, Parcel, Expense } from '../data/model'
import { entryParcelIds } from './logView'

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
  cropId: string
  cropName: string
  varietyId?: string
  varietyName?: string
  parcelId?: string
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

  function rowFor(cropId: string, varietyId: string | undefined): CropSeasonRow {
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

export interface ParcelSeasonRow {
  parcelId: string
  parcelName: string
  year: number
  totalKg: number
  yieldPerM2Kg?: number
  grossValueEuros?: number
  expensesEuros: number
  netEuros?: number
  totalWaterLiters: number
  totalRainLiters: number
}

export function summarizeParcelSeason(
  entries: GardenLogEntry[],
  parcels: Parcel[],
  crops: Crop[],
  expenses: Expense[],
  year: number,
  settings: AppSettings,
): ParcelSeasonRow[] {
  const bounds = seasonBounds(year, settings)
  const byParcel = new Map<string, ParcelSeasonRow>()

  function rowFor(parcelId: string): ParcelSeasonRow {
    const existing = byParcel.get(parcelId)
    if (existing) return existing
    const parcel = parcels.find((p) => p.id === parcelId)
    const row: ParcelSeasonRow = {
      parcelId,
      parcelName: parcel?.name ?? '(parcelle supprimée)',
      year,
      totalKg: 0,
      expensesEuros: 0,
      totalWaterLiters: 0,
      totalRainLiters: 0,
    }
    byParcel.set(parcelId, row)
    return row
  }

  for (const e of entries) {
    if (!inWindow(e.date, bounds)) continue

    if (e.type === 'recolte' && e.quantityKg != null && e.parcelId != null) {
      rowFor(e.parcelId).totalKg += e.quantityKg
    } else if (e.type === 'arrosage' && e.volumeLiters != null) {
      // Répartition égale entre les parcelles jointes (goutte-à-goutte commun) : pas de
      // double comptage, à raffiner le jour où un débitmètre par parcelle existe.
      const ids = entryParcelIds(e)
      if (ids.length > 0) {
        const share = e.volumeLiters / ids.length
        for (const parcelId of ids) rowFor(parcelId).totalWaterLiters += share
      }
    } else if (e.type === 'releve_pluie' && e.rainMm != null && e.parcelId != null) {
      const parcel = parcels.find((p) => p.id === e.parcelId)
      if (parcel?.areaM2 != null) {
        rowFor(e.parcelId).totalRainLiters += e.rainMm * parcel.areaM2
      }
    }
  }

  for (const exp of expenses) {
    if (exp.parcelId == null || !inWindow(exp.date, bounds)) continue
    if (!parcels.some((p) => p.id === exp.parcelId)) continue
    rowFor(exp.parcelId).expensesEuros += exp.amountEuros
  }

  for (const row of byParcel.values()) {
    let grossValueEuros: number | undefined
    for (const e of entries) {
      if (e.type !== 'recolte' || e.parcelId !== row.parcelId || e.quantityKg == null) continue
      if (!inWindow(e.date, bounds)) continue
      const crop = e.cropId != null ? crops.find((c) => c.id === e.cropId) : undefined
      if (crop?.pricePerKg != null) {
        grossValueEuros = (grossValueEuros ?? 0) + e.quantityKg * crop.pricePerKg
      }
    }
    row.grossValueEuros = grossValueEuros
    const parcel = parcels.find((p) => p.id === row.parcelId)
    row.yieldPerM2Kg = parcel?.areaM2 != null && parcel.areaM2 > 0 ? row.totalKg / parcel.areaM2 : undefined
    row.netEuros = grossValueEuros != null ? grossValueEuros - row.expensesEuros : undefined
  }

  return Array.from(byParcel.values()).sort((a, b) => a.parcelName.localeCompare(b.parcelName))
}
