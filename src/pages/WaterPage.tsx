import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { summarizeWaterUsage } from '../services/waterUsageService'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function WaterPage() {
  const entries = useLiveQuery(() => db.log.toArray(), [], [])
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const rows = summarizeWaterUsage(entries, parcels, todayISO())

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold text-green-800">Réserve d'eau</h1>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Pas encore d'arrosage enregistré</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.parcelId} className="rounded bg-green-50 p-3">
              <h2 className="text-lg font-semibold text-green-700">{row.parcelName}</h2>
              <p className="mt-1 text-sm text-green-900">
                7j : {row.liters7} L · 14j : {row.liters14} L · 30j : {row.liters30} L · Année :{' '}
                {row.litersYear} L
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
