import { useState } from 'react'
import type { MouseEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../data/db'
import { TERRAIN_OUTLINE } from '../data/terrainShape'
import { ZoneShapeEditor } from '../components/ZoneShapeEditor'

const ZONE_COLORS = [
  'rgba(34,197,94,0.35)',
  'rgba(59,130,246,0.35)',
  'rgba(234,179,8,0.35)',
  'rgba(236,72,153,0.35)',
  'rgba(168,85,247,0.35)',
  'rgba(249,115,22,0.35)',
]

export function GardenMapPage() {
  const navigate = useNavigate()
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const [drawing, setDrawing] = useState(false)
  const [pendingPolygon, setPendingPolygon] = useState<{ x: number; y: number }[] | null>(null)
  const [existingParcelId, setExistingParcelId] = useState('')
  const [newParcelName, setNewParcelName] = useState('')

  const mappedParcels = parcels.filter((p) => (p.mapPolygon?.length ?? 0) >= 3)
  const unmappedParcels = parcels.filter((p) => (p.mapPolygon?.length ?? 0) < 3)

  function handleZoneClick(parcelId: number | undefined) {
    return (e: MouseEvent<SVGPolygonElement>) => {
      e.stopPropagation()
      if (parcelId == null) return
      navigate('/ajouter', { state: { voiceDraft: { type: 'arrosage', parcelId } } })
    }
  }

  async function assignPolygon() {
    if (!pendingPolygon) return
    if (existingParcelId) {
      await db.parcels.update(Number(existingParcelId), { mapPolygon: pendingPolygon })
    } else {
      const trimmed = newParcelName.trim()
      if (!trimmed) return
      await db.parcels.add({ name: trimmed, mapPolygon: pendingPolygon })
    }
    setPendingPolygon(null)
    setExistingParcelId('')
    setNewParcelName('')
  }

  if (drawing) {
    return (
      <div className="p-4">
        <ZoneShapeEditor
          onValidate={(polygon) => {
            setDrawing(false)
            setPendingPolygon(polygon)
          }}
          onCancel={() => setDrawing(false)}
        />
      </div>
    )
  }

  if (pendingPolygon) {
    return (
      <div className="space-y-3 p-4">
        <h2 className="text-lg font-semibold text-green-700">Associer cette zone à une parcelle</h2>
        {unmappedParcels.length > 0 && (
          <select
            aria-label="Parcelle existante"
            value={existingParcelId}
            onChange={(e) => setExistingParcelId(e.target.value)}
            className="w-full rounded border border-green-300 px-2 py-2 text-sm"
          >
            <option value="">— Choisir une parcelle existante —</option>
            {unmappedParcels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <input
          aria-label="Nouvelle parcelle"
          placeholder="Ou créer une nouvelle parcelle"
          value={newParcelName}
          onChange={(e) => setNewParcelName(e.target.value)}
          disabled={!!existingParcelId}
          className="w-full rounded border border-green-300 px-2 py-2 text-sm disabled:opacity-50"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={assignPolygon}
            disabled={!existingParcelId && !newParcelName.trim()}
            className="rounded-lg bg-green-600 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Enregistrer
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingPolygon(null)
              setExistingParcelId('')
              setNewParcelName('')
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600"
          >
            Annuler
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold text-green-800">Carte du jardin</h1>
      <div className="relative">
        <svg
          data-testid="garden-map-surface"
          className="w-full rounded-lg"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          <polygon
            points={TERRAIN_OUTLINE.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="rgb(220 252 231)"
            stroke="rgb(34 197 94)"
            strokeWidth={0.004}
          />
          {mappedParcels.map((p, i) => (
            <polygon
              key={p.id}
              data-testid={`map-zone-${p.id}`}
              points={p.mapPolygon!.map((pt) => `${pt.x},${pt.y}`).join(' ')}
              fill={ZONE_COLORS[i % ZONE_COLORS.length]}
              stroke="rgb(34 197 94)"
              strokeWidth={0.004}
              onClick={handleZoneClick(p.id)}
              className="cursor-pointer"
            />
          ))}
        </svg>
      </div>
      <ul className="space-y-1">
        {mappedParcels.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block size-3 rounded"
              style={{ backgroundColor: ZONE_COLORS[i % ZONE_COLORS.length] }}
            />
            {p.name}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setDrawing(true)}
        className="text-sm font-medium text-green-700"
      >
        + Nouvelle zone
      </button>
    </div>
  )
}
