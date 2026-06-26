import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { summarizeHarvests, type HarvestRow } from '../services/harvestService'

function groupByCrop(rows: HarvestRow[]): Map<string, HarvestRow[]> {
  const map = new Map<string, HarvestRow[]>()
  for (const row of rows) {
    const list = map.get(row.cropName) ?? []
    list.push(row)
    map.set(row.cropName, list)
  }
  return map
}

function HarvestBarChart({ rows }: { rows: HarvestRow[] }) {
  const maxKg = Math.max(...rows.map((r) => r.totalKg))
  return (
    <div className="mt-2 flex items-end gap-2" style={{ height: 80 }}>
      {rows.map((row) => (
        <div key={row.year} className="flex flex-col items-center" style={{ width: 32 }}>
          <span className="text-xs text-gray-500">{row.totalKg} kg</span>
          <div
            className="w-full rounded-t bg-green-500"
            style={{ height: `${(row.totalKg / maxKg) * 56}px` }}
          />
          <span className="mt-1 text-xs text-gray-400">{row.year}</span>
        </div>
      ))}
    </div>
  )
}

export function HarvestPage() {
  const entries = useLiveQuery(() => db.log.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const rows = summarizeHarvests(entries, crops)
  const grouped = groupByCrop(rows)

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold text-green-800">Récoltes et rendements</h1>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Pas encore de récolte enregistrée</p>
      ) : (
        Array.from(grouped.entries()).map(([cropName, cropRows]) => (
          <section key={cropName} className="rounded bg-green-50 p-3">
            <h2 className="text-lg font-semibold text-green-700">{cropName}</h2>
            <ul className="mt-2 space-y-1 text-sm text-green-900">
              {cropRows.map((row) => (
                <li key={row.year}>
                  {row.year} · {row.totalKg} kg
                  {row.totalEuros != null ? ` · ${row.totalEuros.toLocaleString('fr-FR')} €` : ''}
                </li>
              ))}
            </ul>
            <HarvestBarChart rows={cropRows} />
          </section>
        ))
      )}
    </div>
  )
}
