import { useState } from 'react'
import { useSettings } from '../services/settingsService'
import { summarizeCropSeason, summarizeParcelSeason } from '../services/seasonSummaryService'
import {
  getCropNote,
  getParcelNote,
  getTreeNote,
  setCropNote,
  setParcelNote,
  setTreeNote,
} from '../services/seasonNotesService'
import { AutoSaveNoteField } from '../components/AutoSaveNoteField'
import { useCollection } from '../data/firestoreHooks'
import type { Crop, Expense, FruitTree, GardenLogEntry, Parcel, SeasonNote, Variety } from '../data/model'

export function SeasonNotesPage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const settings = useSettings()
  const { data: entries } = useCollection<GardenLogEntry>('log')
  const { data: crops } = useCollection<Crop>('crops')
  const { data: varieties } = useCollection<Variety>('varieties')
  const { data: parcels } = useCollection<Parcel>('parcels')
  const { data: expenses } = useCollection<Expense>('expenses')
  const { data: trees } = useCollection<FruitTree>('trees')
  const { data: notes } = useCollection<SeasonNote>('seasonNotes')

  if (!settings) {
    return <p className="text-sm text-green-700">Chargement…</p>
  }

  const cropRows = summarizeCropSeason(entries, crops, varieties, parcels, expenses, year, settings)
  const parcelRows = summarizeParcelSeason(entries, parcels, crops, expenses, year, settings)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title-screen text-green-950">Notes de saison</h1>

      <label className="flex flex-col gap-1 text-sm text-green-800">
        Année
        <select
          aria-label="Année des notes"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="w-32 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm"
        >
          {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </label>

      <section>
        <h2 className="text-title-card text-green-700">Cultures</h2>
        {cropRows.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Aucune culture pour {year}.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {cropRows.map((row) => (
              <li key={`${row.cropId}-${row.varietyId ?? 'none'}`} className="rounded-xl bg-white px-3 py-2.5 shadow-sm">
                <p className="font-medium text-green-950">
                  {row.cropName}
                  {row.varietyName ? <span className="text-sm text-gray-500"> · {row.varietyName}</span> : null}
                </p>
                <AutoSaveNoteField
                  key={year}
                  label="À refaire ou à changer"
                  ariaLabel={`À refaire ou à changer pour ${row.cropName}`}
                  value={getCropNote(notes, row.cropId, year)}
                  onSave={(text) => setCropNote(notes, row.cropId, year, text)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-title-card text-green-700">Parcelles</h2>
        {parcelRows.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Aucune parcelle pour {year}.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {parcelRows.map((row) => (
              <li key={row.parcelId} className="rounded-xl bg-white px-3 py-2.5 shadow-sm">
                <p className="font-medium text-green-950">{row.parcelName}</p>
                <AutoSaveNoteField
                  key={year}
                  label="Météo marquante"
                  ariaLabel={`Météo marquante pour ${row.parcelName}`}
                  value={getParcelNote(notes, row.parcelId, year)}
                  onSave={(text) => setParcelNote(notes, row.parcelId, year, text)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-title-card text-green-700">Arbres</h2>
        {trees.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Aucun arbre enregistré.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {trees.map((tree) => (
              <li key={tree.id} className="rounded-xl bg-white px-3 py-2.5 shadow-sm">
                <p className="font-medium text-green-950">{tree.name}</p>
                <AutoSaveNoteField
                  key={year}
                  label="Qualité de récolte"
                  ariaLabel={`Qualité de récolte pour ${tree.name}`}
                  value={getTreeNote(notes, tree.id ?? '', year)}
                  onSave={(text) => tree.id != null && setTreeNote(notes, tree.id, year, text)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
