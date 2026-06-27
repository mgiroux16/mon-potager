import type { Parcel, GardenLogEntry, Crop, CatalogItem, VegetableFamily } from '../data/model'

export interface InactiveParcelReminder {
  parcel: Parcel
  daysSinceLastEntry: number | null
}

export interface HarvestReminder {
  crop: Crop
  vegetable: string
  daysSinceReference: number
  referenceKind: 'semis' | 'plantation'
}

function daysBetween(from: string, to: string): number {
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24))
}

export function getInactiveParcels(
  parcels: Parcel[],
  log: GardenLogEntry[],
  today: string,
  thresholdDays = 21,
): InactiveParcelReminder[] {
  const result: InactiveParcelReminder[] = []

  for (const parcel of parcels) {
    const entries = log.filter((e) => e.parcelId === parcel.id)
    if (entries.length === 0) {
      result.push({ parcel, daysSinceLastEntry: null })
      continue
    }

    const lastDate = entries.reduce((max, e) => (e.date > max ? e.date : max), entries[0].date)
    const days = daysBetween(lastDate, today)
    if (days >= thresholdDays) {
      result.push({ parcel, daysSinceLastEntry: days })
    }
  }

  return result
}

export function getHarvestReminders(
  crops: Crop[],
  catalog: CatalogItem[],
  log: GardenLogEntry[],
  today: string,
): HarvestReminder[] {
  const result: HarvestReminder[] = []

  for (const crop of crops) {
    if (crop.status !== 'en_place' && crop.status !== 'en_recolte') continue
    if (crop.catalogId == null) continue

    const catalogItem = catalog.find((c) => c.id === crop.catalogId)
    if (catalogItem?.daysToHarvest == null) continue

    const alreadyHarvested = log.some((e) => e.type === 'recolte' && e.cropId === crop.id)
    if (alreadyHarvested) continue

    const useSemis = (catalogItem.sowingMonths?.length ?? 0) > 0
    const referenceType = useSemis ? 'semis' : 'plantation'
    const referenceEntries = log
      .filter((e) => e.type === referenceType && e.cropId === crop.id)
      .sort((a, b) => (a.date < b.date ? -1 : 1))

    if (referenceEntries.length === 0) continue

    const referenceDate = referenceEntries[0].date
    const daysSinceReference = daysBetween(referenceDate, today)

    if (daysSinceReference >= catalogItem.daysToHarvest) {
      result.push({
        crop,
        vegetable: catalogItem.vegetable,
        daysSinceReference,
        referenceKind: referenceType,
      })
    }
  }

  return result
}

export interface RotationReminder {
  parcel: Parcel
  family: VegetableFamily
  crop: Crop
}

function cropYear(crop: Crop): number | null {
  const date = crop.sowingDate ?? crop.plantingDate
  if (!date) return null
  return new Date(date).getFullYear()
}

export function getRotationReminders(
  parcels: Parcel[],
  crops: Crop[],
  catalog: CatalogItem[],
  today: string,
): RotationReminder[] {
  const currentYear = new Date(today).getFullYear()
  const previousYear = currentYear - 1

  const familiesByParcelYear = new Map<string, Set<VegetableFamily>>()

  for (const crop of crops) {
    if (crop.parcelId == null || crop.catalogId == null) continue
    const year = cropYear(crop)
    if (year == null) continue

    const catalogItem = catalog.find((c) => c.id === crop.catalogId)
    if (catalogItem == null || catalogItem.family === 'autres') continue

    const key = `${crop.parcelId}-${year}`
    const set = familiesByParcelYear.get(key) ?? new Set<VegetableFamily>()
    set.add(catalogItem.family)
    familiesByParcelYear.set(key, set)
  }

  const result: RotationReminder[] = []

  for (const crop of crops) {
    if (crop.parcelId == null || crop.catalogId == null) continue
    const year = cropYear(crop)
    if (year !== currentYear) continue

    const catalogItem = catalog.find((c) => c.id === crop.catalogId)
    if (catalogItem == null || catalogItem.family === 'autres') continue

    const previousFamilies = familiesByParcelYear.get(`${crop.parcelId}-${previousYear}`)
    if (previousFamilies?.has(catalogItem.family)) {
      const parcel = parcels.find((p) => p.id === crop.parcelId)
      if (parcel) {
        result.push({ parcel, family: catalogItem.family, crop })
      }
    }
  }

  return result
}
