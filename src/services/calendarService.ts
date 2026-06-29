import type { CatalogItem } from '../data/model'

export interface MonthPlan {
  toSow: CatalogItem[]
  toPlant: CatalogItem[]
  toHarvest: CatalogItem[]
}

function byVegetable(a: CatalogItem, b: CatalogItem): number {
  return a.vegetable.localeCompare(b.vegetable, 'fr')
}

function filterByMonth(
  catalog: CatalogItem[],
  month: number,
  field: 'sowingMonths' | 'plantingMonths' | 'harvestMonths',
): CatalogItem[] {
  return catalog.filter((item) => item[field]?.includes(month)).sort(byVegetable)
}

export function getMonthPlan(
  catalog: CatalogItem[],
  month: number,
  gardenCatalogIds?: Set<string>,
): MonthPlan {
  const harvestable = gardenCatalogIds
    ? catalog.filter((item) => item.id && gardenCatalogIds.has(item.id))
    : catalog

  return {
    toSow: filterByMonth(catalog, month, 'sowingMonths'),
    toPlant: filterByMonth(catalog, month, 'plantingMonths'),
    toHarvest: filterByMonth(harvestable, month, 'harvestMonths'),
  }
}
