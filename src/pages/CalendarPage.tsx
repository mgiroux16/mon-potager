import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { db } from '../data/db'
import type { CatalogItem } from '../data/model'
import { getMonthPlan, type MonthPlan } from '../services/calendarService'

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

function cycleMonth(month: number, delta: number): number {
  return ((month - 1 + delta + 12) % 12) + 1
}

interface SectionProps {
  title: string
  items: CatalogItem[]
  emptyVerb: string
}

function Section({ title, items, emptyVerb }: SectionProps) {
  return (
    <section className="mt-4">
      <h2 className="text-lg font-semibold text-green-700">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-green-700/60">Rien à {emptyVerb} ce mois-ci.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li key={item.id} className="rounded bg-green-50 px-3 py-2">
              {item.vegetable}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function CalendarPage() {
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [gardenCatalogIds, setGardenCatalogIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    db.catalog.toArray().then(setCatalog)
    db.crops.toArray().then((crops) => {
      const ids = crops
        .filter((crop) => !crop.deletedAt && crop.catalogId)
        .map((crop) => crop.catalogId as string)
      setGardenCatalogIds(new Set(ids))
    })
  }, [])

  const plan: MonthPlan = getMonthPlan(catalog, month, gardenCatalogIds)

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Mois precedent"
          onClick={() => setMonth((m) => cycleMonth(m, -1))}
          className="rounded-lg p-2 text-green-700 hover:bg-green-100"
        >
          <ChevronLeft />
        </button>
        <h1 className="text-xl font-bold text-green-900">{MOIS_FR[month - 1]}</h1>
        <button
          type="button"
          aria-label="Mois suivant"
          onClick={() => setMonth((m) => cycleMonth(m, 1))}
          className="rounded-lg p-2 text-green-700 hover:bg-green-100"
        >
          <ChevronRight />
        </button>
      </div>

      <Section title="À semer" items={plan.toSow} emptyVerb="semer" />
      <Section title="À planter" items={plan.toPlant} emptyVerb="planter" />
      <Section title="À récolter" items={plan.toHarvest} emptyVerb="récolter" />
    </div>
  )
}
