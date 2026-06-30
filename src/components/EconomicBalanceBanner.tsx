import { MetricCard } from './ui/MetricCard'
import { economicBalance } from '../services/expenseService'
import type { Expense } from '../data/model'
import type { HarvestRow } from '../services/harvestService'

function formatEuros(value: number): string {
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`
}

/**
 * Bandeau coût réel / valeur récoltes / solde, partagé entre Argent et Bilan
 * (même calcul via expenseService.economicBalance, pas de calcul parallèle).
 */
export function EconomicBalanceBanner({
  expenses,
  harvestRows,
  year,
}: {
  expenses: Expense[]
  harvestRows: HarvestRow[]
  year: number
}) {
  const balance = economicBalance(expenses, harvestRows, year)
  const positive = balance.balance >= 0

  return (
    <div className="grid grid-cols-3 gap-2">
      <MetricCard label={`Coût réel ${year}`} value={formatEuros(balance.realCost)} tone="argent" />
      <MetricCard label="Valeur récoltes" value={formatEuros(balance.harvestValue)} tone="recolte" />
      <MetricCard
        label={positive ? 'Économie' : 'Déficit'}
        value={formatEuros(balance.balance)}
        tone={positive ? 'marque' : 'alerte'}
      />
    </div>
  )
}
