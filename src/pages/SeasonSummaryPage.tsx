import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { getSettings } from '../services/settingsService'
import {
  summarizeCropSeason,
  summarizeParcelSeason,
  type CropSeasonRow,
  type ParcelSeasonRow,
} from '../services/seasonSummaryService'
import type { AppSettings } from '../data/model'

function useSettings(): AppSettings | undefined {
  return useLiveQuery(() => getSettings(), [], undefined)
}

function formatKg(kg: number): string {
  return `${kg.toLocaleString('fr-FR')} kg`
}

function formatEuros(value: number): string {
  return `${value.toLocaleString('fr-FR')} €`
}

function CropRowView({ row }: { row: CropSeasonRow }) {
  return (
    <li className="rounded bg-green-50 px-3 py-2">
      <span className="font-medium">{row.cropName}</span>
      <span className="text-sm text-gray-500"> · {row.varietyName}</span>
      {row.parcelName ? <span className="text-sm text-gray-500"> · {row.parcelName}</span> : null}
      <div className="text-sm text-green-900">
        {formatKg(row.totalKg)}
        {row.yieldPerPlantKg != null ? ` · ${row.yieldPerPlantKg.toFixed(2)} kg/plant` : ''}
        {row.yieldPerM2Kg != null ? ` · ${row.yieldPerM2Kg.toFixed(2)} kg/m²` : ''}
        {row.netEuros != null ? ` · net ${formatEuros(row.netEuros)}` : ''}
      </div>
    </li>
  )
}

function ParcelRowView({ row }: { row: ParcelSeasonRow }) {
  return (
    <li className="rounded bg-green-50 px-3 py-2">
      <span className="font-medium">{row.parcelName}</span>
      <div className="text-sm text-green-900">
        {formatKg(row.totalKg)}
        {row.yieldPerM2Kg != null ? ` · ${row.yieldPerM2Kg.toFixed(2)} kg/m²` : ''}
        {row.netEuros != null ? ` · net ${formatEuros(row.netEuros)}` : ''}
        {` · ${row.totalWaterLiters} L arrosés`}
        {` · ${row.totalRainLiters} L de pluie`}
      </div>
    </li>
  )
}

export function SeasonSummaryPage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const settings = useSettings()
  const entries = useLiveQuery(() => db.log.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const varieties = useLiveQuery(() => db.varieties.toArray(), [], [])
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const expenses = useLiveQuery(() => db.expenses.toArray(), [], [])

  if (!settings) {
    return <p className="text-sm text-green-700">Chargement…</p>
  }

  const cropRows = summarizeCropSeason(entries, crops, varieties, parcels, expenses, year, settings)
  const parcelRows = summarizeParcelSeason(entries, parcels, crops, expenses, year, settings)

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold text-green-800">Bilan de saison</h1>

      <label className="flex flex-col gap-1 text-sm text-green-800">
        Année
        <select
          aria-label="Année du bilan"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="w-32 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm"
        >
          {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>

      {cropRows.length === 0 && parcelRows.length === 0 ? (
        <p className="text-sm text-gray-500">Rien à montrer pour {year}</p>
      ) : (
        <>
          <section>
            <h2 className="text-lg font-semibold text-green-700">Par culture et variété</h2>
            <ul className="mt-2 space-y-1">
              {cropRows.map((row) => (
                <CropRowView key={`${row.cropId}-${row.varietyId ?? 'none'}`} row={row} />
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-green-700">Par parcelle</h2>
            <ul className="mt-2 space-y-1">
              {parcelRows.map((row) => (
                <ParcelRowView key={row.parcelId} row={row} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
