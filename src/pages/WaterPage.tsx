import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { useCollection } from '../data/firestoreHooks'
import { cloudPut } from '../data/firestoreWrites'
import type { GardenLogEntry, WaterTank } from '../data/model'
import { summarizeWaterUsage } from '../services/waterUsageService'
import { summarizeTankAutonomy } from '../services/tankAutonomyService'
import { resolveRainMm, compareWateringToRain } from '../services/wateringComparisonService'
import { fetchDailyHistory, type DailyWeather } from '../services/weatherService'
import { useSettings } from '../services/settingsService'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function TankLevelInput({ tank }: { tank: WaterTank }) {
  const [value, setValue] = useState(
    tank.estimatedLiters != null ? String(tank.estimatedLiters) : '',
  )

  async function save() {
    const parsed = value.trim() === '' ? undefined : Number(value.replace(',', '.'))
    if (tank.id != null && parsed != null && !Number.isNaN(parsed)) {
      cloudPut('tanks', tank.id, { estimatedLiters: parsed })
    }
  }

  return (
    <li className="flex items-center justify-between rounded bg-green-50 px-3 py-2">
      <span className="font-medium text-green-900">{tank.name}</span>
      <label className="flex items-center gap-1 text-sm text-green-800">
        <input
          aria-label={`Niveau de ${tank.name} en litres`}
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="w-20 rounded border border-green-300 px-1 py-0.5 text-sm"
        />
        L / {tank.capacityLiters} L
      </label>
    </li>
  )
}

export function WaterPage() {
  const { data: entries } = useCollection<GardenLogEntry>('log')
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const { data: tanks } = useCollection<WaterTank>('tanks')
  const settings = useSettings()
  const [history, setHistory] = useState<DailyWeather[] | null>(null)

  useEffect(() => {
    if (!settings) return
    let alive = true
    fetchDailyHistory(settings.latitude, settings.longitude, 30).then((h) => {
      if (alive) setHistory(h)
    })
    return () => {
      alive = false
    }
  }, [settings])

  const refDate = todayISO()
  const rows = summarizeWaterUsage(entries, parcels, refDate)
  const tankSummary = summarizeTankAutonomy(tanks, entries, refDate)

  const rainMm7 = resolveRainMm(entries, history, refDate, 7)
  const rainMm14 = resolveRainMm(entries, history, refDate, 14)
  const rainMm30 = resolveRainMm(entries, history, refDate, 30)
  const comparisonRows = compareWateringToRain(rows, parcels, rainMm7, rainMm14, rainMm30)

  return (
    <div className="space-y-6 p-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0 lg:p-0">
      <h1 className="text-xl font-bold text-green-800 lg:col-span-2">Réserve d'eau</h1>

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

      {comparisonRows.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-green-800">Arrosage vs pluie par parcelle</h2>
          <ul className="space-y-2">
            {comparisonRows.map((row) => (
              <li key={row.parcelId} className="rounded bg-blue-50 p-3">
                <h3 className="font-medium text-blue-900">{row.parcelName}</h3>
                <ul className="mt-1 space-y-1 text-sm text-blue-900">
                  <li>
                    7j : {row.liters7} L versés +{' '}
                    {row.rainLiters7 != null
                      ? `${Math.round(row.rainLiters7)} L pluie`
                      : 'surface non renseignée'}{' '}
                    = {Math.round(row.totalLiters7)} L
                  </li>
                  <li>
                    14j : {row.liters14} L versés +{' '}
                    {row.rainLiters14 != null
                      ? `${Math.round(row.rainLiters14)} L pluie`
                      : 'surface non renseignée'}{' '}
                    = {Math.round(row.totalLiters14)} L
                  </li>
                  <li>
                    30j : {row.liters30} L versés +{' '}
                    {row.rainLiters30 != null
                      ? `${Math.round(row.rainLiters30)} L pluie`
                      : 'surface non renseignée'}{' '}
                    = {Math.round(row.totalLiters30)} L
                  </li>
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded bg-green-50 p-3">
        <p className="text-sm font-medium text-green-900">
          Réserve d'eau : {tankSummary.totalEstimatedLiters} / {tankSummary.totalCapacityLiters} L
        </p>
        <p className="mt-1 text-sm text-green-900">
          Autonomie :{' '}
          {tankSummary.autonomyDays != null ? `${tankSummary.autonomyDays} jours` : 'illimitée'}
        </p>
      </section>

      {tanks.length > 0 && (
        <ul className="space-y-2">
          {tanks.map((t) => (
            <TankLevelInput key={t.id} tank={t} />
          ))}
        </ul>
      )}
    </div>
  )
}
