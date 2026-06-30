import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../data/db'
import type { Expense, ExpenseAmortization, ExpenseRecurrence, ExpensePeriodicity } from '../data/model'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const FIELD =
  'w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-indigo-950 focus:border-indigo-400 focus:outline-none'
const LABEL = 'flex flex-col gap-1 text-sm text-indigo-900'

export function ExpenseForm({ onSaved }: { onSaved?: () => void }) {
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])

  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [amortization, setAmortization] = useState<ExpenseAmortization>('consommable')
  const [lifespanYears, setLifespanYears] = useState('')
  const [usagePeriodMonths, setUsagePeriodMonths] = useState('')
  const [recurrence, setRecurrence] = useState<ExpenseRecurrence>('ponctuelle')
  const [periodicity, setPeriodicity] = useState<ExpensePeriodicity>('mensuelle')
  const [category, setCategory] = useState('')
  const [parcelId, setParcelId] = useState('')
  const [cropId, setCropId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const amountEuros = Number(amount.replace(',', '.'))
    if (!Number.isFinite(amountEuros) || amountEuros <= 0) {
      setError('Indique un montant supérieur à 0.')
      return
    }
    // Validations : durée obligatoire si durable/étalé, périodicité si récurrente.
    if (amortization === 'durable' && (!lifespanYears || Number(lifespanYears) <= 0)) {
      setError('Indique la durée de vie (années) pour un bien durable.')
      return
    }
    if (amortization === 'etale' && (!usagePeriodMonths || Number(usagePeriodMonths) <= 0)) {
      setError("Indique la durée d'étalement (mois) pour une dépense étalée.")
      return
    }

    const expense: Expense = {
      id: newId(),
      label: label.trim() || 'Dépense',
      amountEuros,
      date: date || todayISO(),
      amortization,
      recurrence,
    }
    if (amortization === 'durable') expense.lifespanYears = Number(lifespanYears)
    if (amortization === 'etale') expense.usagePeriodMonths = Number(usagePeriodMonths)
    if (recurrence === 'recurrente') expense.periodicity = periodicity
    if (category.trim()) expense.category = category.trim()
    if (parcelId) expense.parcelId = parcelId
    if (cropId) expense.cropId = cropId

    await db.expenses.add(expense)

    setLabel('')
    setAmount('')
    setDate(todayISO())
    setAmortization('consommable')
    setLifespanYears('')
    setUsagePeriodMonths('')
    setRecurrence('ponctuelle')
    setPeriodicity('mensuelle')
    setCategory('')
    setParcelId('')
    setCropId('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    onSaved?.()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-indigo-800">Nouvelle dépense</h2>

      <label className={LABEL}>
        Objet
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex. terreau, bâche, abonnement eau…"
          className={FIELD}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL}>
          Montant (€)
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className={FIELD}
            aria-label="Montant en euros"
          />
        </label>
        <label className={LABEL}>
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={FIELD}
            aria-label="Date de la dépense"
          />
        </label>
      </div>

      {/* Axe 1 : amortissement */}
      <label className={LABEL}>
        Type d'amortissement
        <select
          aria-label="Type d'amortissement"
          value={amortization}
          onChange={(e) => setAmortization(e.target.value as ExpenseAmortization)}
          className={FIELD}
        >
          <option value="consommable">Consommable (utilisé dans l'année)</option>
          <option value="durable">Durable (réparti sur des années)</option>
          <option value="etale">Étalé (réparti sur des mois)</option>
        </select>
      </label>

      {amortization === 'durable' && (
        <label className={LABEL}>
          Durée de vie (années)
          <input
            type="number"
            min="1"
            step="1"
            value={lifespanYears}
            onChange={(e) => setLifespanYears(e.target.value)}
            placeholder="Ex. 5"
            className={FIELD}
            aria-label="Durée de vie en années"
          />
        </label>
      )}

      {amortization === 'etale' && (
        <label className={LABEL}>
          Durée d'étalement (mois)
          <input
            type="number"
            min="1"
            step="1"
            value={usagePeriodMonths}
            onChange={(e) => setUsagePeriodMonths(e.target.value)}
            placeholder="Ex. 6"
            className={FIELD}
            aria-label="Durée d'étalement en mois"
          />
        </label>
      )}

      {/* Axe 2 : récurrence */}
      <label className={LABEL}>
        Récurrence
        <select
          aria-label="Récurrence"
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value as ExpenseRecurrence)}
          className={FIELD}
        >
          <option value="ponctuelle">Ponctuelle</option>
          <option value="recurrente">Récurrente (fixe)</option>
        </select>
      </label>

      {recurrence === 'recurrente' && (
        <label className={LABEL}>
          Périodicité
          <select
            aria-label="Périodicité"
            value={periodicity}
            onChange={(e) => setPeriodicity(e.target.value as ExpensePeriodicity)}
            className={FIELD}
          >
            <option value="mensuelle">Mensuelle</option>
            <option value="annuelle">Annuelle</option>
          </select>
        </label>
      )}

      <label className={LABEL}>
        Catégorie (facultatif)
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Ex. semences, eau, matériel…"
          className={FIELD}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL}>
          Parcelle (facultatif)
          <select
            aria-label="Parcelle rattachée"
            value={parcelId}
            onChange={(e) => setParcelId(e.target.value)}
            className={FIELD}
          >
            <option value="">(aucune)</option>
            {parcels.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Culture (facultatif)
          <select
            aria-label="Culture rattachée"
            value={cropId}
            onChange={(e) => setCropId(e.target.value)}
            className={FIELD}
          >
            <option value="">(aucune)</option>
            {crops.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <button
        type="submit"
        className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
      >
        Enregistrer la dépense
      </button>

      {saved && <p className="text-sm text-indigo-700">Dépense enregistrée.</p>}
    </form>
  )
}
