import { describe, it, expect } from 'vitest'
import { getMonthPlan } from './calendarService'
import type { CatalogItem } from '../data/model'

function item(over: Partial<CatalogItem>): CatalogItem {
  return { vegetable: 'Test', family: 'autres', ...over }
}

describe('getMonthPlan', () => {
  it('filtre les legumes a semer, planter, recolter pour un mois donne', () => {
    const catalog: CatalogItem[] = [
      item({ vegetable: 'Tomate', sowingMonths: [3, 4], plantingMonths: [5], harvestMonths: [7, 8] }),
      item({ vegetable: 'Pomme de terre', plantingMonths: [3, 4], harvestMonths: [7, 8] }),
      item({ vegetable: 'Ail', plantingMonths: [10, 11], harvestMonths: [6, 7] }),
    ]

    const plan = getMonthPlan(catalog, 7)

    expect(plan.toSow.map((c) => c.vegetable)).toEqual([])
    expect(plan.toPlant.map((c) => c.vegetable)).toEqual([])
    expect(plan.toHarvest.map((c) => c.vegetable)).toEqual(['Ail', 'Pomme de terre', 'Tomate'])
  })

  it('trie chaque section par ordre alphabetique francais', () => {
    const catalog: CatalogItem[] = [
      item({ vegetable: 'Échalote', plantingMonths: [3] }),
      item({ vegetable: 'Ail', plantingMonths: [3] }),
      item({ vegetable: 'Betterave', plantingMonths: [3] }),
    ]

    const plan = getMonthPlan(catalog, 3)

    expect(plan.toPlant.map((c) => c.vegetable)).toEqual(['Ail', 'Betterave', 'Échalote'])
  })

  it('place un legume dans plusieurs sections si plusieurs mois correspondent au meme mois', () => {
    const catalog: CatalogItem[] = [
      item({ vegetable: 'Radis', sowingMonths: [3, 4, 8], harvestMonths: [4, 5, 9] }),
    ]

    const plan = getMonthPlan(catalog, 4)

    expect(plan.toSow.map((c) => c.vegetable)).toEqual(['Radis'])
    expect(plan.toHarvest.map((c) => c.vegetable)).toEqual(['Radis'])
  })

  it('renvoie des listes vides si aucun legume ne correspond au mois', () => {
    const catalog: CatalogItem[] = [item({ vegetable: 'Tomate', sowingMonths: [3, 4] })]

    const plan = getMonthPlan(catalog, 12)

    expect(plan).toEqual({ toSow: [], toPlant: [], toHarvest: [] })
  })

  it('ignore les legumes sans le tableau de mois correspondant', () => {
    const catalog: CatalogItem[] = [item({ vegetable: 'Patate douce' })]

    const plan = getMonthPlan(catalog, 5)

    expect(plan).toEqual({ toSow: [], toPlant: [], toHarvest: [] })
  })
})
