import { useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../data/db'
import type { Parcel } from '../data/model'

const CELL = 32
const GRID_COLS = 20
const GRID_ROWS = 16
const CLICK_THRESHOLD = 5

const ZONE_COLORS = [
  'rgb(187,247,208)',
  'rgb(191,219,254)',
  'rgb(254,240,138)',
  'rgb(251,207,232)',
  'rgb(233,213,255)',
  'rgb(254,202,202)',
]

function colorFor(id: number) {
  return ZONE_COLORS[id % ZONE_COLORS.length]
}

function nextFreeSlot(parcels: Parcel[]): { x: number; y: number } {
  const placed = parcels.filter((p) => p.mapWidth != null && p.mapHeight != null)
  if (placed.length === 0) return { x: 0, y: 0 }
  const maxBottom = Math.max(...placed.map((p) => (p.mapY ?? 0) + (p.mapHeight ?? 1)))
  return { x: 0, y: maxBottom }
}

interface DragState {
  id: number
  pointerStartX: number
  pointerStartY: number
  originMapX: number
  originMapY: number
  moved: boolean
}

interface ResizeState {
  id: number
  pointerStartX: number
  pointerStartY: number
  originWidth: number
  originHeight: number
}

export function GardenMapPage() {
  const navigate = useNavigate()
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const [zoom, setZoom] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)
  const [livePositions, setLivePositions] = useState<Record<number, { x: number; y: number }>>({})
  const [liveSizes, setLiveSizes] = useState<Record<number, { w: number; h: number }>>({})

  const placed = parcels.filter((p) => p.mapWidth != null && p.mapHeight != null && p.id != null)
  const unplaced = parcels.filter((p) => p.mapWidth == null || p.mapHeight == null)

  function cell(n: number) {
    return n * CELL * zoom
  }

  async function placeParcel(parcel: Parcel) {
    if (parcel.id == null) return
    const slot = nextFreeSlot(parcels)
    await db.parcels.update(parcel.id, { mapX: slot.x, mapY: slot.y, mapWidth: 2, mapHeight: 2, mapRotation: 0 })
  }

  async function addParcel() {
    const slot = nextFreeSlot(parcels)
    await db.parcels.add({ name: 'Nouvelle zone', mapX: slot.x, mapY: slot.y, mapWidth: 2, mapHeight: 2, mapRotation: 0 })
  }

  async function rotateParcel(parcel: Parcel) {
    if (parcel.id == null) return
    const current = parcel.mapRotation ?? 0
    const next = ((current + 90) % 360) as 0 | 90 | 180 | 270
    await db.parcels.update(parcel.id, { mapRotation: next })
  }

  async function duplicateParcel(parcel: Parcel) {
    const slot = nextFreeSlot(parcels)
    await db.parcels.add({
      name: `${parcel.name} (copie)`,
      mapX: slot.x,
      mapY: slot.y,
      mapWidth: parcel.mapWidth,
      mapHeight: parcel.mapHeight,
      mapRotation: parcel.mapRotation ?? 0,
    })
    setSelectedId(null)
  }

  async function deleteParcel(parcel: Parcel) {
    if (parcel.id == null) return
    if (window.confirm(`Supprimer la parcelle "${parcel.name}" ?`)) {
      await db.parcels.delete(parcel.id)
      setSelectedId(null)
    }
  }

  function startRename(parcel: Parcel) {
    if (parcel.id == null) return
    setRenamingId(parcel.id)
    setRenameValue(parcel.name)
  }

  async function saveRename() {
    if (renamingId == null) return
    const trimmed = renameValue.trim()
    if (trimmed) await db.parcels.update(renamingId, { name: trimmed })
    setRenamingId(null)
  }

  function waterParcel(parcel: Parcel) {
    if (parcel.id == null) return
    navigate('/ajouter', { state: { voiceDraft: { type: 'arrosage', parcelId: parcel.id } } })
  }

  function handleBlockPointerDown(parcel: Parcel) {
    return (e: ReactMouseEvent<HTMLDivElement>) => {
      if (parcel.id == null) return
      e.stopPropagation()
      dragRef.current = {
        id: parcel.id,
        pointerStartX: e.clientX,
        pointerStartY: e.clientY,
        originMapX: parcel.mapX ?? 0,
        originMapY: parcel.mapY ?? 0,
        moved: false,
      }
    }
  }

  function handleGridPointerMove(e: ReactMouseEvent<HTMLDivElement>) {
    if (dragRef.current) {
      const d = dragRef.current
      const dx = e.clientX - d.pointerStartX
      const dy = e.clientY - d.pointerStartY
      if (Math.abs(dx) > CLICK_THRESHOLD || Math.abs(dy) > CLICK_THRESHOLD) d.moved = true
      const newX = d.originMapX + dx / (CELL * zoom)
      const newY = d.originMapY + dy / (CELL * zoom)
      setLivePositions((prev) => ({ ...prev, [d.id]: { x: newX, y: newY } }))
    } else if (resizeRef.current) {
      const r = resizeRef.current
      const dx = e.clientX - r.pointerStartX
      const dy = e.clientY - r.pointerStartY
      const newW = Math.max(1, r.originWidth + dx / (CELL * zoom))
      const newH = Math.max(1, r.originHeight + dy / (CELL * zoom))
      setLiveSizes((prev) => ({ ...prev, [r.id]: { w: newW, h: newH } }))
    }
  }

  async function handleGridPointerUp() {
    if (dragRef.current) {
      const d = dragRef.current
      dragRef.current = null
      const live = livePositions[d.id]
      if (live) {
        const snappedX = Math.max(0, Math.round(live.x))
        const snappedY = Math.max(0, Math.round(live.y))
        await db.parcels.update(d.id, { mapX: snappedX, mapY: snappedY })
        setLivePositions((prev) => {
          const next = { ...prev }
          delete next[d.id]
          return next
        })
      }
      if (!d.moved) setSelectedId((current) => (current === d.id ? null : d.id))
    }
    if (resizeRef.current) {
      const r = resizeRef.current
      resizeRef.current = null
      const live = liveSizes[r.id]
      if (live) {
        const snappedW = Math.max(1, Math.round(live.w))
        const snappedH = Math.max(1, Math.round(live.h))
        await db.parcels.update(r.id, { mapWidth: snappedW, mapHeight: snappedH })
        setLiveSizes((prev) => {
          const next = { ...prev }
          delete next[r.id]
          return next
        })
      }
    }
  }

  function handleResizePointerDown(parcel: Parcel) {
    return (e: ReactMouseEvent<HTMLDivElement>) => {
      if (parcel.id == null) return
      e.stopPropagation()
      resizeRef.current = {
        id: parcel.id,
        pointerStartX: e.clientX,
        pointerStartY: e.clientY,
        originWidth: parcel.mapWidth ?? 2,
        originHeight: parcel.mapHeight ?? 2,
      }
    }
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold text-green-800">Carte du jardin</h1>
      <p className="text-sm text-gray-500">
        Glisse pour déplacer · Clique pour sélectionner (rotation, dupliquer) · Coin bas-droit pour
        redimensionner
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Zoomer moins"
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          className="rounded border border-green-300 px-2 py-1 text-sm text-green-700"
        >
          −
        </button>
        <span className="text-sm text-gray-500">x{zoom.toFixed(2)}</span>
        <button
          type="button"
          aria-label="Zoomer plus"
          onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
          className="rounded border border-green-300 px-2 py-1 text-sm text-green-700"
        >
          +
        </button>
      </div>

      <div className="overflow-auto rounded-lg border border-green-200">
        <div
          data-testid="garden-map-grid"
          onMouseMove={handleGridPointerMove}
          onMouseUp={handleGridPointerUp}
          onMouseLeave={handleGridPointerUp}
          className="relative bg-[length:var(--cell)_var(--cell)]"
          style={
            {
              width: cell(GRID_COLS),
              height: cell(GRID_ROWS),
              '--cell': `${CELL * zoom}px`,
              backgroundImage:
                'linear-gradient(to right, rgba(34,197,94,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(34,197,94,0.15) 1px, transparent 1px)',
            } as React.CSSProperties
          }
        >
          {placed.map((p) => {
            if (p.id == null) return null
            const live = livePositions[p.id]
            const liveSize = liveSizes[p.id]
            const x = live ? live.x : p.mapX ?? 0
            const y = live ? live.y : p.mapY ?? 0
            const w = liveSize ? liveSize.w : p.mapWidth ?? 2
            const h = liveSize ? liveSize.h : p.mapHeight ?? 2
            const isSelected = selectedId === p.id
            return (
              <div
                key={p.id}
                data-testid={`map-block-${p.id}`}
                onMouseDown={handleBlockPointerDown(p)}
                className="absolute flex select-none items-center justify-center rounded-md border-2 text-center text-xs font-medium text-green-900"
                style={{
                  left: cell(x),
                  top: cell(y),
                  width: cell(w),
                  height: cell(h),
                  backgroundColor: colorFor(p.id),
                  borderColor: isSelected ? 'rgb(34 197 94)' : 'transparent',
                  transform: `rotate(${p.mapRotation ?? 0}deg)`,
                  cursor: 'grab',
                }}
              >
                {renamingId === p.id ? (
                  <input
                    autoFocus
                    aria-label="Renommer la parcelle"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={saveRename}
                    onKeyDown={(e) => e.key === 'Enter' && saveRename()}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="w-[90%] rounded border border-green-400 px-1 text-center text-xs"
                  />
                ) : (
                  <span className="px-1">{p.name}</span>
                )}

                {isSelected && (
                  <div
                    data-testid={`map-resize-${p.id}`}
                    onMouseDown={handleResizePointerDown(p)}
                    className="absolute bottom-0 right-0 size-3 cursor-nwse-resize rounded-tl bg-green-600"
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {selectedId != null &&
        (() => {
          const parcel = placed.find((p) => p.id === selectedId)
          if (!parcel) return null
          return (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => rotateParcel(parcel)}
                className="rounded-lg border border-green-300 px-3 py-2 text-sm text-green-700"
              >
                Rotation
              </button>
              <button
                type="button"
                onClick={() => startRename(parcel)}
                className="rounded-lg border border-green-300 px-3 py-2 text-sm text-green-700"
              >
                Renommer
              </button>
              <button
                type="button"
                onClick={() => duplicateParcel(parcel)}
                className="rounded-lg border border-green-300 px-3 py-2 text-sm text-green-700"
              >
                Dupliquer
              </button>
              <button
                type="button"
                onClick={() => waterParcel(parcel)}
                className="rounded-lg bg-green-600 px-3 py-2 text-sm text-white"
              >
                Arroser
              </button>
              <button
                type="button"
                onClick={() => deleteParcel(parcel)}
                className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600"
              >
                Supprimer
              </button>
            </div>
          )
        })()}

      {unplaced.length > 0 && (
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-green-700">Parcelles à placer</h2>
          {unplaced.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded bg-green-50 px-3 py-2 text-sm">
              <span>{p.name}</span>
              <button type="button" onClick={() => placeParcel(p)} className="text-green-700">
                Placer sur la carte
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={addParcel} className="text-sm font-medium text-green-700">
        + Nouvelle parcelle
      </button>
    </div>
  )
}
