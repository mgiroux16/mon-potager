import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { NotebookPen } from 'lucide-react'
import { db } from '../data/db'
import { listLog } from '../services/logService'
import {
  describeLogEntry,
  formatLogDate,
  LOG_TYPE_LABELS,
  type LogRefs,
} from '../services/logView'
import { LOG_TYPE_ICONS } from '../components/logTypeIcons'
import type { LogEntryType } from '../data/model'

function chipClass(active: boolean): string {
  return [
    'rounded-full px-3 py-1 text-sm font-medium transition-colors',
    active ? 'bg-green-600 text-white' : 'bg-green-100 text-green-800 hover:bg-green-200',
  ].join(' ')
}

export function JournalPage() {
  const entries = useLiveQuery(() => listLog(), [], [])
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const oyas = useLiveQuery(() => db.oyas.toArray(), [], [])
  const trees = useLiveQuery(() => db.trees.toArray(), [], [])
  const [filter, setFilter] = useState<LogEntryType | 'tout'>('tout')

  const refs: LogRefs = {
    parcels: new Map(parcels.map((p) => [p.id!, p] as [number, typeof p])),
    crops: new Map(crops.map((c) => [c.id!, c] as [number, typeof c])),
    oyas: new Map(oyas.map((o) => [o.id!, o] as [number, typeof o])),
    trees: new Map(trees.map((t) => [t.id!, t] as [number, typeof t])),
  }

  if (entries.length === 0) {
    return (
      <section className="flex flex-col gap-6">
        <header className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-green-100 text-green-700">
            <NotebookPen className="size-5" />
          </span>
          <h1 className="text-xl font-semibold text-green-950">Journal</h1>
        </header>
        <div className="rounded-2xl border border-dashed border-green-300 bg-white/60 p-6 text-center">
          <p className="text-sm font-medium text-green-800">Rien encore, note ta première action.</p>
          <Link
            to="/ajouter"
            className="mt-3 inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white"
          >
            Ajouter une entrée
          </Link>
        </div>
      </section>
    )
  }

  const presentTypes = [...new Set(entries.map((e) => e.type))]
  const shown = filter === 'tout' ? entries : entries.filter((e) => e.type === filter)
  const now = new Date()

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-green-950">Journal</h1>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setFilter('tout')} className={chipClass(filter === 'tout')}>
          Tout
        </button>
        {presentTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setFilter(type)}
            className={chipClass(filter === type)}
          >
            {LOG_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {shown.map((entry) => {
          const view = describeLogEntry(entry, refs)
          const Icon = LOG_TYPE_ICONS[entry.type]
          return (
            <li
              key={entry.id}
              className="flex items-start gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm"
            >
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-green-100 text-green-700">
                <Icon className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-green-950">
                  {view.typeLabel}
                  {view.target ? ` · ${view.target}` : ''}
                </p>
                {view.detail && <p className="truncate text-sm text-green-700/80">{view.detail}</p>}
              </div>
              <span className="shrink-0 text-xs text-green-700/60">{formatLogDate(entry, now)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
