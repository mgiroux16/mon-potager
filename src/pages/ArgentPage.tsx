import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { db } from '../data/db'
import type { Expense } from '../data/model'
import { ExpenseForm } from '../components/ExpenseForm'
import { EconomicBalanceBanner } from '../components/EconomicBalanceBanner'
import { ListCard } from '../components/ui/ListCard'
import { summarizeHarvests } from '../services/harvestService'
import {
  bucketOf,
  annualAmortizedCost,
  remainingAmortization,
  seasonExpenseSummary,
} from '../services/expenseService'

type Tab = 'fixes' | 'variables' | 'amortissements'

function formatEuros(value: number): string {
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`
}

function ExpenseRow({ expense, children }: { expense: Expense; children?: React.ReactNode }) {
  async function remove() {
    if (expense.id) await db.expenses.delete(expense.id)
  }
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-indigo-50/50 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="font-medium text-indigo-950">{expense.label}</span>
        <span className="text-indigo-700"> · {expense.date}</span>
        {expense.category && <span className="text-indigo-700"> · {expense.category}</span>}
      </span>
      {children}
      <span className="font-medium text-indigo-900">{formatEuros(expense.amountEuros)}</span>
      <button
        type="button"
        onClick={remove}
        aria-label={`Supprimer ${expense.label}`}
        className="rounded p-1 text-indigo-400 hover:bg-indigo-100 hover:text-red-500"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  )
}

export function ArgentPage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [tab, setTab] = useState<Tab>('variables')

  const expenses = useLiveQuery(() => db.expenses.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const log = useLiveQuery(() => db.log.toArray(), [], [])

  const harvestRows = summarizeHarvests(log ?? [], crops ?? [])
  const yearExpenses = (expenses ?? []).filter((e) => e.date.startsWith(String(year)))

  const fixes = yearExpenses.filter((e) => bucketOf(e) === 'fixe')
  const variables = yearExpenses.filter((e) => bucketOf(e) === 'variable')
  const amortissements = yearExpenses.filter((e) => bucketOf(e) === 'amortissement')

  const summary = seasonExpenseSummary(expenses ?? [], year)

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'fixes', label: 'Fixes', count: fixes.length },
    { id: 'variables', label: 'Variables', count: variables.length },
    { id: 'amortissements', label: 'Amortissements', count: amortissements.length },
  ]

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-title-screen text-indigo-950">Argent</h1>
        <select
          aria-label="Année"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm text-indigo-900"
        >
          {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <EconomicBalanceBanner expenses={expenses ?? []} harvestRows={harvestRows} year={year} />

      {/* Onglets */}
      <nav className="flex gap-1 border-b border-indigo-100">
        {TABS.map(({ id, label, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={[
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === id
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-indigo-700',
            ].join(' ')}
          >
            {label} {count > 0 && <span className="text-indigo-600">({count})</span>}
          </button>
        ))}
      </nav>

      {/* Contenu onglet */}
      {tab === 'fixes' && (
        <ListCard
          emptyMessage="Aucune dépense fixe / récurrente pour cette année."
          header={<TabSubtotal label="Total fixes annualisé" value={summary.fixesEuros} />}
          items={fixes}
          renderItem={(e) => (
            <ExpenseRow key={e.id} expense={e}>
              <span className="text-xs text-indigo-600">
                {e.periodicity === 'mensuelle' ? '/mois' : '/an'}
              </span>
            </ExpenseRow>
          )}
        />
      )}

      {tab === 'variables' && (
        <ListCard
          emptyMessage="Aucune dépense variable / ponctuelle pour cette année."
          header={<TabSubtotal label="Total variables" value={summary.consommablesEuros} />}
          items={variables}
          renderItem={(e) => <ExpenseRow key={e.id} expense={e} />}
        />
      )}

      {tab === 'amortissements' && (
        <ListCard
          emptyMessage="Aucun bien durable / étalé pour cette année."
          header={<TabSubtotal label={`Part amortie ${year}`} value={summary.amortizedEuros} />}
          items={amortissements}
          renderItem={(e) => (
            <ExpenseRow key={e.id} expense={e}>
              <span className="whitespace-nowrap text-xs text-indigo-600">
                {formatEuros(annualAmortizedCost(e))}/an
                <span> · reste {formatEuros(remainingAmortization(e, year))}</span>
              </span>
            </ExpenseRow>
          )}
        />
      )}

      <ExpenseForm />
    </section>
  )
}

function TabSubtotal({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm font-medium text-indigo-900">
      <span>{label}</span>
      <span>{formatEuros(value)}</span>
    </div>
  )
}
