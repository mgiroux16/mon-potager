import { useState } from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { softDelete } from '../data/syncHooks'
import { useCollection } from '../data/firestoreHooks'
import type { FruitTree, GardenLogEntry, SeasonNote, WaterNeed } from '../data/model'
import { summarizeTreeHarvests } from '../services/treeHarvestService'
import { getTreeNote, setTreeNote } from '../services/seasonNotesService'

interface TreeCardProps {
  tree: FruitTree
}

const WATER_NEED_LABELS: Record<WaterNeed, string> = {
  faible: 'Faible',
  moyen: 'Moyen',
  eleve: 'Élevé',
}

export function TreeCard({ tree }: TreeCardProps) {
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const { data: log } = useCollection<GardenLogEntry>('log')
  const seasonNotes = useLiveQuery(() => db.seasonNotes.toArray(), [], [])

  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(tree.name)
  const [editingVariety, setEditingVariety] = useState(false)
  const [variety, setVariety] = useState(tree.variety ?? '')
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState(tree.notes ?? '')
  const [expanded, setExpanded] = useState(false)
  const currentYear = new Date().getFullYear()
  const [qualityYear, setQualityYear] = useState(currentYear)
  const qualityNote = getTreeNote(seasonNotes as SeasonNote[], tree.id ?? '', qualityYear)
  const [qualityText, setQualityText] = useState(qualityNote)

  async function saveQualityNote() {
    if (tree.id == null) return
    await setTreeNote(tree.id, qualityYear, qualityText)
  }

  async function saveName() {
    setRenaming(false)
    const trimmed = name.trim()
    if (tree.id != null && trimmed && trimmed !== tree.name) {
      await db.trees.update(tree.id, { name: trimmed })
    } else {
      setName(tree.name)
    }
  }

  async function saveVariety() {
    setEditingVariety(false)
    if (tree.id == null) return
    const trimmed = variety.trim()
    await db.trees.update(tree.id, { variety: trimmed || undefined })
  }

  async function saveNotes() {
    setEditingNotes(false)
    if (tree.id == null) return
    const trimmed = notes.trim()
    await db.trees.update(tree.id, { notes: trimmed || undefined })
  }

  async function saveWaterNeed(value: string) {
    if (tree.id == null) return
    await db.trees.update(tree.id, { waterNeed: (value || undefined) as WaterNeed | undefined })
  }

  async function saveParcel(value: string) {
    if (tree.id == null) return
    await db.trees.update(tree.id, { parcelId: value || undefined })
  }

  async function removeTree() {
    if (tree.id == null) return
    if (window.confirm(`Supprimer l'arbre "${tree.name}" ?`)) {
      await softDelete('trees', tree.id)
    }
  }

  const harvestsByYear = expanded ? summarizeTreeHarvests(tree.id ?? '', log) : {}
  const harvestYears = Object.keys(harvestsByYear)
    .map(Number)
    .sort((a, b) => b - a)
  const journalEntries = expanded
    ? log
        .filter((e) => e.treeId === tree.id)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    : []
  const photoEntries = expanded
    ? log
        .filter((e) => e.treeId === tree.id && (e.photoUrls?.length ?? 0) > 0)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    : []

  return (
    <div className="overflow-hidden rounded-lg bg-green-50">
      <div className="flex items-center gap-2 px-3 py-2">
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && saveName()}
            className="rounded border border-green-300 px-1 text-sm"
          />
        ) : (
          <span onClick={() => setRenaming(true)} className="cursor-pointer font-medium">
            {tree.name}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label={expanded ? "Réduire l'historique" : "Afficher l'historique"}
            onClick={() => setExpanded((v) => !v)}
            className="text-green-700"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button type="button" aria-label="Supprimer l'arbre" onClick={removeTree} className="text-red-600">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1 px-3 pb-2 text-sm text-gray-600">
        {editingVariety ? (
          <input
            aria-label="Variété"
            autoFocus
            value={variety}
            onChange={(e) => setVariety(e.target.value)}
            onBlur={saveVariety}
            onKeyDown={(e) => e.key === 'Enter' && saveVariety()}
            className="rounded border border-green-300 px-1 text-sm"
          />
        ) : (
          <span onClick={() => setEditingVariety(true)} className="cursor-pointer">
            Variété : {tree.variety || '—'}
          </span>
        )}

        <label className="flex items-center gap-1">
          Besoin en eau :
          <select
            aria-label="Besoin en eau"
            value={tree.waterNeed ?? ''}
            onChange={(e) => saveWaterNeed(e.target.value)}
            className="rounded border border-green-300 bg-white px-1 text-sm"
          >
            <option value="">(non renseigné)</option>
            {(Object.keys(WATER_NEED_LABELS) as WaterNeed[]).map((w) => (
              <option key={w} value={w}>{WATER_NEED_LABELS[w]}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1">
          Parcelle :
          <select
            aria-label="Parcelle de rattachement"
            value={tree.parcelId ?? ''}
            onChange={(e) => saveParcel(e.target.value)}
            className="rounded border border-green-300 bg-white px-1 text-sm"
          >
            <option value="">(aucune)</option>
            {parcels.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        {editingNotes ? (
          <textarea
            aria-label="Notes"
            autoFocus
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            className="rounded border border-green-300 px-1 text-sm"
          />
        ) : (
          <span onClick={() => setEditingNotes(true)} className="cursor-pointer">
            Notes : {tree.notes || '—'}
          </span>
        )}
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 border-t border-green-200 px-3 py-2 text-sm">
          <div>
            <p className="font-medium text-green-800">Récoltes par année</p>
            {harvestYears.length === 0 ? (
              <p className="text-gray-500">Aucune récolte enregistrée.</p>
            ) : (
              <ul>
                {harvestYears.map((year, i) => (
                  <li
                    key={year}
                    className={`px-2 py-1 ${i % 2 === 0 ? 'bg-white' : 'bg-green-100'}`}
                  >
                    {year} : {harvestsByYear[year]} kg
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="font-medium text-green-800">Historique du journal</p>
            {journalEntries.length === 0 ? (
              <p className="text-gray-500">Aucune entrée.</p>
            ) : (
              <ul>
                {journalEntries.map((e) => (
                  <li key={e.id} className="px-2 py-1">
                    {e.date} : {e.title ?? e.description ?? e.type}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="font-medium text-green-800">Photos de l'arbre</p>
            {photoEntries.length === 0 ? (
              <p className="text-gray-500">Aucune photo enregistrée.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {photoEntries.map((e) => (
                  <li key={e.id} className="flex flex-col items-center gap-1">
                    <img
                      src={e.photoUrls?.[0]}
                      alt={`Photo du ${e.date}`}
                      className="size-16 rounded object-cover"
                    />
                    <span className="text-xs text-gray-500">{e.date}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="font-medium text-green-800">Qualité de récolte</p>
            <label className="flex items-center gap-1 text-xs text-gray-600">
              Année :
              <select
                aria-label="Année qualité de récolte"
                value={qualityYear}
                onChange={(e) => {
                  const year = Number(e.target.value)
                  setQualityYear(year)
                  setQualityText(getTreeNote(seasonNotes as SeasonNote[], tree.id ?? '', year))
                }}
                className="rounded border border-green-300 bg-white px-1 text-sm"
              >
                {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
            <textarea
              aria-label="Qualité de récolte"
              rows={2}
              value={qualityText}
              onChange={(e) => setQualityText(e.target.value)}
              onBlur={saveQualityNote}
              className="mt-1 w-full rounded border border-green-300 px-1 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  )
}
