import { useLiveQuery } from 'dexie-react-hooks'
import { Sprout, Trees, MapPin } from 'lucide-react'
import { db } from '../data/db'

export function GardenPage() {
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const trees = useLiveQuery(() => db.trees.toArray(), [], [])

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold text-green-800">Mon jardin</h1>

      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-green-700">
          <MapPin size={18} /> Parcelles
        </h2>
        <ul className="mt-2 space-y-1">
          {parcels.map((p) => (
            <li key={p.id} className="rounded bg-green-50 px-3 py-2">
              <span className="font-medium">{p.name}</span>
              {p.areaM2 ? <span className="text-sm text-gray-500"> · {p.areaM2} m²</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-green-700">
          <Sprout size={18} /> Cultures
        </h2>
        <ul className="mt-2 space-y-1">
          {crops.map((c) => (
            <li key={c.id} className="rounded bg-green-50 px-3 py-2">
              {c.name}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-green-700">
          <Trees size={18} /> Verger
        </h2>
        <ul className="mt-2 space-y-1">
          {trees.map((t) => (
            <li key={t.id} className="rounded bg-green-50 px-3 py-2">
              {t.name}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
