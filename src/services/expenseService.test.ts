import { describe, it, expect } from 'vitest'
import {
  bucketOf,
  annualAmortizedCost,
  amortizedAmountForYear,
  remainingAmortization,
  seasonExpenseSummary,
  economicBalance,
} from './expenseService'
import type { Expense } from '../data/model'
import type { HarvestRow } from './harvestService'

function exp(over: Partial<Expense>): Expense {
  return {
    label: 'Dépense',
    amountEuros: 0,
    date: '2026-04-01',
    amortization: 'consommable',
    recurrence: 'ponctuelle',
    ...over,
  }
}

describe('bucketOf', () => {
  it('recurrente passe en fixe même si durable (précédence recurrence)', () => {
    expect(bucketOf(exp({ recurrence: 'recurrente', amortization: 'durable' }))).toBe('fixe')
  })
  it('ponctuelle durable -> amortissement', () => {
    expect(bucketOf(exp({ recurrence: 'ponctuelle', amortization: 'durable' }))).toBe('amortissement')
  })
  it('ponctuelle etale -> amortissement', () => {
    expect(bucketOf(exp({ recurrence: 'ponctuelle', amortization: 'etale' }))).toBe('amortissement')
  })
  it('ponctuelle consommable -> variable', () => {
    expect(bucketOf(exp({ recurrence: 'ponctuelle', amortization: 'consommable' }))).toBe('variable')
  })
})

describe('annualAmortizedCost', () => {
  it('bâche 80 € / 5 ans = 16 €/an', () => {
    expect(annualAmortizedCost(exp({ amountEuros: 80, amortization: 'durable', lifespanYears: 5 }))).toBe(16)
  })

  it('étalé 120 € sur 6 mois = 240 €/an (annualisé)', () => {
    expect(annualAmortizedCost(exp({ amountEuros: 120, amortization: 'etale', usagePeriodMonths: 6 }))).toBe(240)
  })

  it('consommable = montant plein', () => {
    expect(annualAmortizedCost(exp({ amountEuros: 30, amortization: 'consommable' }))).toBe(30)
  })

  // — Garde-fou : divisions blindées, jamais NaN/Infinity —
  it('durable sans lifespanYears -> montant plein, pas Infinity', () => {
    const v = annualAmortizedCost(exp({ amountEuros: 80, amortization: 'durable' }))
    expect(v).toBe(80)
    expect(Number.isFinite(v)).toBe(true)
  })
  it('durable lifespanYears = 0 -> montant plein, pas Infinity', () => {
    const v = annualAmortizedCost(exp({ amountEuros: 80, amortization: 'durable', lifespanYears: 0 }))
    expect(v).toBe(80)
    expect(Number.isFinite(v)).toBe(true)
  })
  it('étalé sans usagePeriodMonths -> montant plein, pas NaN', () => {
    const v = annualAmortizedCost(exp({ amountEuros: 120, amortization: 'etale' }))
    expect(v).toBe(120)
    expect(Number.isNaN(v)).toBe(false)
  })
  it('étalé usagePeriodMonths = 0 -> montant plein, pas Infinity', () => {
    const v = annualAmortizedCost(exp({ amountEuros: 120, amortization: 'etale', usagePeriodMonths: 0 }))
    expect(v).toBe(120)
    expect(Number.isFinite(v)).toBe(true)
  })
})

describe('amortizedAmountForYear', () => {
  it('durable 80/5 imputé 16 € chaque année de la durée de vie', () => {
    const e = exp({ amountEuros: 80, amortization: 'durable', lifespanYears: 5, date: '2026-04-01' })
    expect(amortizedAmountForYear(e, 2026)).toBe(16)
    expect(amortizedAmountForYear(e, 2030)).toBe(16) // 5e et dernière année
    expect(amortizedAmountForYear(e, 2031)).toBe(0) // hors durée de vie
    expect(amortizedAmountForYear(e, 2025)).toBe(0) // avant achat
  })

  it('étalé 120 € sur 6 mois à cheval sur 2 années', () => {
    // achat 2026-11 : nov, déc 2026 (2 mois) puis janv-avril 2027 (4 mois)
    const e = exp({ amountEuros: 120, amortization: 'etale', usagePeriodMonths: 6, date: '2026-11-01' })
    expect(amortizedAmountForYear(e, 2026)).toBe(40) // 2 mois × 20
    expect(amortizedAmountForYear(e, 2027)).toBe(80) // 4 mois × 20
  })

  it('consommable imputé seulement l’année de la dépense', () => {
    const e = exp({ amountEuros: 30, amortization: 'consommable', date: '2026-04-01' })
    expect(amortizedAmountForYear(e, 2026)).toBe(30)
    expect(amortizedAmountForYear(e, 2027)).toBe(0)
  })
})

describe('remainingAmortization', () => {
  it('bâche 80/5 : reste 64 € après la 1re année', () => {
    const e = exp({ amountEuros: 80, amortization: 'durable', lifespanYears: 5, date: '2026-04-01' })
    expect(remainingAmortization(e, 2026)).toBe(64)
    expect(remainingAmortization(e, 2030)).toBe(0)
  })
})

describe('seasonExpenseSummary', () => {
  it('agrège sans double comptage, par bucket', () => {
    const expenses: Expense[] = [
      exp({ amountEuros: 10, recurrence: 'recurrente', periodicity: 'mensuelle', amortization: 'consommable' }), // fixe : 120/an
      exp({ amountEuros: 80, recurrence: 'ponctuelle', amortization: 'durable', lifespanYears: 5 }), // amort : 16/an
      exp({ amountEuros: 30, recurrence: 'ponctuelle', amortization: 'consommable' }), // variable : 30
    ]
    const s = seasonExpenseSummary(expenses, 2026)
    expect(s.fixesEuros).toBe(120)
    expect(s.amortizedEuros).toBe(16)
    expect(s.consommablesEuros).toBe(30)
    expect(s.realCost).toBe(166)
  })

  it('une dépense récurrente durable ne compte que dans fixes (pas dans amorti)', () => {
    const expenses: Expense[] = [
      exp({ amountEuros: 50, recurrence: 'recurrente', periodicity: 'annuelle', amortization: 'durable', lifespanYears: 5 }),
    ]
    const s = seasonExpenseSummary(expenses, 2026)
    expect(s.fixesEuros).toBe(50)
    expect(s.amortizedEuros).toBe(0)
    expect(s.realCost).toBe(50)
  })

  it('liste vide -> tout à zéro', () => {
    const s = seasonExpenseSummary([], 2026)
    expect(s).toEqual({ fixesEuros: 0, consommablesEuros: 0, amortizedEuros: 0, realCost: 0 })
  })
})

describe('economicBalance', () => {
  it('solde = valeur récoltes - coût réel', () => {
    const expenses: Expense[] = [
      exp({ amountEuros: 30, recurrence: 'ponctuelle', amortization: 'consommable' }),
    ]
    const harvests: HarvestRow[] = [
      { cropId: 'c1', cropName: 'Tomate', year: 2026, totalKg: 10, pricePerKg: 4, totalEuros: 40 },
      { cropId: 'c2', cropName: 'Courgette', year: 2025, totalKg: 5, totalEuros: 10 }, // autre année, ignorée
    ]
    const b = economicBalance(expenses, harvests, 2026)
    expect(b.realCost).toBe(30)
    expect(b.harvestValue).toBe(40)
    expect(b.balance).toBe(10)
  })
})
