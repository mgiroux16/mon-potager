import { useState } from 'react'
import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Copy, Pencil, Trash2 } from 'lucide-react'
import { db } from '../data/db'
import type { Parcel } from '../data/model'
import { compressImage } from '../services/imageService'
import { isPointInPolygon } from '../services/geometry'
import { nextFreeMapSlot } from '../services/mapLayout'
import { ParcelPolygonEditor } from './ParcelPolygonEditor'

interface ParcelCardProps {
  parcel: Parcel
}

export function ParcelCard({ parcel }: ParcelCardProps) {
  const navigate = useNavigate()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(parcel.name)
  const [editingPhoto, setEditingPhoto] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [pendingPhotoUrl, setPendingPhotoUrl] = useState<string | null>(null)
  const [editingArea, setEditingArea] = useState(false)
  const [area, setArea] = useState(parcel.areaM2 != null ? String(parcel.areaM2) : '')

  const hasZone = !!parcel.photoUrl && (parcel.polygon?.length ?? 0) >= 3

  async function saveName() {
    setRenaming(false)
    const trimmed = name.trim()
    if (parcel.id != null && trimmed && trimmed !== parcel.name) {
      await db.parcels.update(parcel.id, { name: trimmed })
    } else {
      setName(parcel.name)
    }
  }

  async function saveArea() {
    setEditingArea(false)
    const trimmed = area.trim()
    if (parcel.id == null) return
    if (trimmed === '') {
      await db.parcels.update(parcel.id, { areaM2: undefined })
      return
    }
    const parsed = Number(trimmed.replace(',', '.'))
    if (!Number.isNaN(parsed) && parsed >= 0) {
      await db.parcels.update(parcel.id, { areaM2: parsed })
    } else {
      setArea(parcel.areaM2 != null ? String(parcel.areaM2) : '')
    }
  }

  async function duplicateParcel() {
    const all = await db.parcels.toArray()
    const slot = nextFreeMapSlot(all)
    await db.parcels.add({
      name: `${parcel.name} (copie)`,
      areaM2: parcel.areaM2,
      exposure: parcel.exposure,
      soil: parcel.soil,
      mulch: parcel.mulch,
      notes: parcel.notes,
      photoUrl: parcel.photoUrl,
      polygon: parcel.polygon,
      mapX: slot.x,
      mapY: slot.y,
      mapWidth: parcel.mapWidth ?? 2,
      mapHeight: parcel.mapHeight ?? 2,
      mapRotation: parcel.mapRotation ?? 0,
    })
  }

  async function removeParcel() {
    if (parcel.id == null) return
    if (window.confirm(`Supprimer la parcelle "${parcel.name}" ?`)) {
      await db.parcels.delete(parcel.id)
    }
  }

  async function handlePhotoSelected(file: File) {
    const dataUrl = await compressImage(file)
    setPendingPhotoUrl(dataUrl)
    setEditingPhoto(false)
    setDrawing(true)
  }

  async function handlePolygonValidated(polygon: { x: number; y: number }[]) {
    if (parcel.id == null) return
    await db.parcels.update(parcel.id, {
      photoUrl: pendingPhotoUrl ?? parcel.photoUrl,
      polygon,
    })
    setDrawing(false)
    setPendingPhotoUrl(null)
  }

  function handleZoneClick(e: MouseEvent<HTMLDivElement>) {
    if (!parcel.polygon) return
    const rect = e.currentTarget.getBoundingClientRect()
    const point = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    }
    if (isPointInPolygon(point, parcel.polygon)) {
      navigate('/ajouter', { state: { voiceDraft: { type: 'arrosage', parcelId: parcel.id } } })
    }
  }

  if (drawing) {
    const photoForEditor = pendingPhotoUrl ?? parcel.photoUrl
    if (!photoForEditor) return null
    return (
      <ParcelPolygonEditor
        photoUrl={photoForEditor}
        onValidate={handlePolygonValidated}
        onCancel={() => {
          setDrawing(false)
          setPendingPhotoUrl(null)
        }}
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg bg-green-50">
      {hasZone ? (
        <div data-testid="parcel-zone" onClick={handleZoneClick} className="relative cursor-pointer">
          <img src={parcel.photoUrl} alt={parcel.name} className="w-full" />
          <svg
            className="absolute inset-0 size-full"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
          >
            <polygon
              points={parcel.polygon!.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(34,197,94,0.25)"
              stroke="rgb(34,197,94)"
              strokeWidth={0.004}
            />
          </svg>
          <span className="absolute left-2 top-2 rounded bg-black/55 px-2 py-1 text-xs text-white">
            {parcel.name}
          </span>
        </div>
      ) : null}

      <div className="flex items-center gap-2 px-3 py-2">
        {!hasZone &&
          (renaming ? (
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
              {parcel.name}
            </span>
          ))}
        {!hasZone &&
          (editingArea ? (
            <input
              aria-label="Surface en m²"
              type="number"
              step="0.1"
              autoFocus
              value={area}
              onChange={(e) => setArea(e.target.value)}
              onBlur={saveArea}
              onKeyDown={(e) => e.key === 'Enter' && saveArea()}
              className="w-16 rounded border border-green-300 px-1 text-sm"
            />
          ) : (
            <button
              type="button"
              aria-label="Modifier la surface"
              onClick={() => setEditingArea(true)}
              className="text-sm text-gray-500"
            >
              · {parcel.areaM2 != null ? `${parcel.areaM2} m²` : 'm²'}
            </button>
          ))}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label={hasZone ? 'Modifier la zone' : 'Ajouter une photo'}
            onClick={() => setEditingPhoto(true)}
            className="text-green-700"
          >
            <Camera size={16} />
          </button>
          {!hasZone && (
            <button
              type="button"
              aria-label="Renommer la parcelle"
              onClick={() => setRenaming(true)}
              className="text-green-700"
            >
              <Pencil size={16} />
            </button>
          )}
          <button
            type="button"
            aria-label="Dupliquer la parcelle"
            onClick={duplicateParcel}
            className="text-green-700"
          >
            <Copy size={16} />
          </button>
          <button type="button" aria-label="Supprimer la parcelle" onClick={removeParcel} className="text-red-600">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {editingPhoto && (
        <div className="px-3 pb-3">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Choisir une photo"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handlePhotoSelected(file)
            }}
          />
        </div>
      )}
    </div>
  )
}
