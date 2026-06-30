import type { Expense } from '../data/model'
import type { HarvestRow } from './harvestService'

export type ExpenseBucket = 'fixe' | 'amortissement' | 'variable'

/**
 * Range chaque depense dans UN seul bucket (mutuellement exclusifs), par precedence :
 *   1. recurrente            -> 'fixe'          (abonnement, eau, electricite, location)
 *   2. durable | etale       -> 'amortissement' (etale sur plusieurs annees)
 *   3. ponctuelle consommable-> 'variable'      (graines, terreau, petit materiel)
 * Une bache ponctuelle+durable est donc UNIQUEMENT dans 'amortissement', jamais comptee deux fois.
 */
export function bucketOf(expense: Expense): ExpenseBucket {
  if (expense.recurrence === 'recurrente') return 'fixe'
  if (expense.amortization === 'durable' || expense.amortization === 'etale') {
    return 'amortissement'
  }
  return 'variable'
}

function yearOf(date: string): number {
  return Number(date.slice(0, 4))
}

/** Coût annuel d'une dépense récurrente (mensuelle -> x12, annuelle -> x1). */
function recurringYearlyCost(expense: Expense): number {
  return expense.periodicity === 'mensuelle' ? expense.amountEuros * 12 : expense.amountEuros
}

/**
 * Taux annuel imputé affiché dans la colonne €/an de l'onglet Amortissements.
 * Divisions blindées : une durée manquante ou nulle ne produit jamais NaN/Infinity,
 * on retombe sur le montant plein (impossible d'étaler sans durée).
 */
export function annualAmortizedCost(expense: Expense): number {
  if (expense.amortization === 'durable') {
    const years = expense.lifespanYears
    if (years == null || years <= 0) return expense.amountEuros
    return expense.amountEuros / years
  }
  if (expense.amortization === 'etale') {
    const months = expense.usagePeriodMonths
    if (months == null || months <= 0) return expense.amountEuros
    return expense.amountEuros / (months / 12)
  }
  // consommable : tout le montant l'année de la dépense
  return expense.amountEuros
}

/**
 * Part d'une dépense amortie attribuée à une année calendaire précise.
 * Hors période d'amortissement -> 0. Durée manquante/nulle -> montant plein l'année d'achat.
 */
export function amortizedAmountForYear(expense: Expense, year: number): number {
  const purchaseYear = yearOf(expense.date)

  if (expense.amortization === 'durable') {
    const years = expense.lifespanYears
    if (years == null || years <= 0) {
      return purchaseYear === year ? expense.amountEuros : 0
    }
    const lastYear = purchaseYear + Math.ceil(years) - 1
    return year >= purchaseYear && year <= lastYear ? expense.amountEuros / years : 0
  }

  if (expense.amortization === 'etale') {
    const months = expense.usagePeriodMonths
    if (months == null || months <= 0) {
      return purchaseYear === year ? expense.amountEuros : 0
    }
    const startMonthIdx = new Date(`${expense.date}T00:00:00`).getMonth() // 0-11
    const perMonth = expense.amountEuros / months
    // Compte les mois de la période d'usage qui tombent dans `year`.
    let monthsInYear = 0
    for (let i = 0; i < months; i++) {
      const absoluteMonth = startMonthIdx + i
      const monthYear = purchaseYear + Math.floor(absoluteMonth / 12)
      if (monthYear === year) monthsInYear++
    }
    return perMonth * monthsInYear
  }

  // consommable : plein montant l'année de la dépense
  return purchaseYear === year ? expense.amountEuros : 0
}

/** Valeur encore non amortie d'un durable/étalé à la fin de `year` (pour la colonne « restant »). */
export function remainingAmortization(expense: Expense, year: number): number {
  if (expense.amortization === 'consommable') return 0
  const purchaseYear = yearOf(expense.date)
  let amortizedSoFar = 0
  for (let y = purchaseYear; y <= year; y++) {
    amortizedSoFar += amortizedAmountForYear(expense, y)
  }
  return Math.max(0, expense.amountEuros - amortizedSoFar)
}

export interface SeasonExpenseSummary {
  fixesEuros: number
  consommablesEuros: number
  amortizedEuros: number
  realCost: number
}

/**
 * Coût réel d'une saison, sans double comptage : chaque dépense compte dans un seul
 * agrégat selon son bucket (précédence recurrence > amortization).
 *   - fixesEuros        : coût annualisé des récurrentes actives (date <= année)
 *   - amortizedEuros    : part de l'année des durables/étalés ponctuels
 *   - consommablesEuros : consommables ponctuels dépensés dans l'année
 */
export function seasonExpenseSummary(expenses: Expense[], year: number): SeasonExpenseSummary {
  let fixesEuros = 0
  let consommablesEuros = 0
  let amortizedEuros = 0

  for (const e of expenses) {
    const bucket = bucketOf(e)
    if (bucket === 'fixe') {
      // récurrente active dès qu'elle a démarré (pas de date de fin dans le modèle)
      if (yearOf(e.date) <= year) fixesEuros += recurringYearlyCost(e)
    } else if (bucket === 'amortissement') {
      amortizedEuros += amortizedAmountForYear(e, year)
    } else {
      if (yearOf(e.date) === year) consommablesEuros += e.amountEuros
    }
  }

  return {
    fixesEuros,
    consommablesEuros,
    amortizedEuros,
    realCost: fixesEuros + consommablesEuros + amortizedEuros,
  }
}

export interface EconomicBalance {
  realCost: number
  harvestValue: number
  balance: number // valeur récoltes - coût réel (positif = économie)
}

/**
 * Bilan économique de la saison : coût réel (fixes + consommables + part amortie)
 * comparé à la valeur des récoltes (pricePerKg × quantityKg, via summarizeHarvests).
 */
export function economicBalance(
  expenses: Expense[],
  harvests: HarvestRow[],
  year: number,
): EconomicBalance {
  const { realCost } = seasonExpenseSummary(expenses, year)
  const harvestValue = harvests
    .filter((h) => h.year === year)
    .reduce((sum, h) => sum + (h.totalEuros ?? 0), 0)
  return { realCost, harvestValue, balance: harvestValue - realCost }
}
