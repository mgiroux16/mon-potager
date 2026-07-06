import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent, TouchEvent as ReactTouchEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCollection } from '../data/firestoreHooks'
import { cloudAdd, cloudDelete, cloudPut } from '../data/firestoreWrites'
import type { Parcel } from '../data/model'
import { nextFreeMapSlot } from '../services/mapLayout'

const CELL_PX = 32
const TOTAL_WIDTH_M = 30
const TOTAL_HEIGHT_M = 30
const SCALE_STEPS = [0.25, 0.5, 1, 2]
const SCALE_MIN = 0.1
const SCALE_MAX = 4
const CLICK_THRESHOLD = 5
const MENU_WIDTH = 180
const MENU_HEIGHT = 240
const MENU_GAP = 6

function computeMenuPosition(rect: { top: number; bottom: number; left: number; right: number }) {
  let top = rect.bottom + MENU_GAP
  if (top + MENU_HEIGHT > window.innerHeight) {
    top = rect.top - MENU_HEIGHT - MENU_GAP
  }
  top = Math.min(Math.max(top, 4), Math.max(4, window.innerHeight - MENU_HEIGHT - 4))

  let left = rect.left
  if (left + MENU_WIDTH > window.innerWidth) {
    left = rect.right - MENU_WIDTH
  }
  left = Math.min(Math.max(left, 4), Math.max(4, window.innerWidth - MENU_WIDTH - 4))

  return { top, left }
}

function clampScale(s: number) {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, s))
}

function touchDistance(t0: { clientX: number; clientY: number }, t1: { clientX: number; clientY: number }) {
  return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
}

const ZONE_COLORS = [
  'rgb(74,222,128)',
  'rgb(96,165,250)',
  'rgb(250,204,21)',
  'rgb(244,114,182)',
  'rgb(192,132,252)',
  'rgb(248,113,113)',
]

function colorFor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return ZONE_COLORS[Math.abs(hash) % ZONE_COLORS.length]
}

interface DragState {
  id: string
  pointerStartX: number
  pointerStartY: number
  originMapX: number
  originMapY: number
  moved: boolean
}

interface ResizeState {
  id: string
  pointerStartX: number
  pointerStartY: number
  originWidth: number
  originHeight: number
}

export function GardenMapPage() {
  const navigate = useNavigate()
  const { data: parcels } = useCollection<Parcel>('parcels')
  const [scale, setScale] = useState(1)
  const gridCols = Math.round(TOTAL_WIDTH_M / scale)
  const gridRows = Math.round(TOTAL_HEIGHT_M / scale)
  // Chaque case fait toujours CELL_PX px a l'ecran ; seule sa valeur en metres change avec le zoom.
  const gridWidthPx = gridCols * CELL_PX
  const gridHeightPx = gridRows * CELL_PX
  const pinchRef = useRef<{ startDistance: number; startScale: number } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)
  const [livePositions, setLivePositions] = useState<Record<string, { x: number; y: number }>>({})
  const [liveSizes, setLiveSizes] = useState<Record<string, { w: number; h: number }>>({})
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const menuRef = useRef<HTMLDivElement | null>(null)

  const placed = parcels.filter((p) => p.mapWidth != null && p.mapHeight != null && p.id != null)
  const unplaced = parcels.filter((p) => p.mapWidth == null || p.mapHeight == null)

  // n est en metres reels ; chaque case de la grille represente `scale` metres
  function cell(n: number) {
    return (n / scale) * CELL_PX
  }

  async function placeParcel(parcel: Parcel) {
    if (parcel.id == null) return
    const slot = nextFreeMapSlot(parcels)
    cloudPut('parcels', parcel.id, { mapX: slot.x, mapY: slot.y, mapWidth: 2, mapHeight: 2, mapRotation: 0 })
  }

  function addParcel() {
    const slot = nextFreeMapSlot(parcels)
    cloudAdd('parcels', { name: 'Nouvelle zone', mapX: slot.x, mapY: slot.y, mapWidth: 2, mapHeight: 2, mapRotation: 0 })
  }

  async function rotateParcel(parcel: Parcel) {
    if (parcel.id == null) return
    const current = parcel.mapRotation ?? 0
    const next = ((current + 90) % 360) as 0 | 90 | 180 | 270
    cloudPut('parcels', parcel.id, { mapRotation: next })
  }

  function duplicateParcel(parcel: Parcel) {
    const slot = nextFreeMapSlot(parcels)
    cloudAdd('parcels', {
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
      cloudDelete('parcels', parcel.id)
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
    if (trimmed) cloudPut('parcels', renamingId, { name: trimmed })
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
      const newX = d.originMapX + (dx / CELL_PX) * scale
      const newY = d.originMapY + (dy / CELL_PX) * scale
      setLivePositions((prev) => ({ ...prev, [d.id]: { x: newX, y: newY } }))
    } else if (resizeRef.current) {
      const r = resizeRef.current
      const dx = e.clientX - r.pointerStartX
      const dy = e.clientY - r.pointerStartY
      const newW = Math.max(scale, r.originWidth + (dx / CELL_PX) * scale)
      const newH = Math.max(scale, r.originHeight + (dy / CELL_PX) * scale)
      setLiveSizes((prev) => ({ ...prev, [r.id]: { w: newW, h: newH } }))
    }
  }

  async function handleGridPointerUp() {
    if (dragRef.current) {
      const d = dragRef.current
      dragRef.current = null
      const live = livePositions[d.id]
      if (live) {
        const snappedX = Math.max(0, Math.round(live.x / scale) * scale)
        const snappedY = Math.max(0, Math.round(live.y / scale) * scale)
        cloudPut('parcels', d.id, { mapX: snappedX, mapY: snappedY })
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
        const snappedW = Math.max(scale, Math.round(live.w / scale) * scale)
        const snappedH = Math.max(scale, Math.round(live.h / scale) * scale)
        cloudPut('parcels', r.id, { mapWidth: snappedW, mapHeight: snappedH })
        setLiveSizes((prev) => {
          const next = { ...prev }
          delete next[r.id]
          return next
        })
      }
    }
  }

  function handleWheelZoom(e: ReactWheelEvent<HTMLDivElement>) {
    // Pinch trackpad (Chrome/Safari/Firefox envoient deltaY + ctrlKey) ou Ctrl/Cmd + molette.
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const factor = Math.exp(e.deltaY * 0.01)
    setScale((s) => clampScale(s * factor))
  }

  function handleTouchStartZoom(e: ReactTouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2) {
      pinchRef.current = {
        startDistance: touchDistance(e.touches[0], e.touches[1]),
        startScale: scale,
      }
    }
  }

  function handleTouchMoveZoom(e: ReactTouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault()
      const distance = touchDistance(e.touches[0], e.touches[1])
      const ratio = distance / pinchRef.current.startDistance
      setScale(clampScale(pinchRef.current.startScale / ratio))
    }
  }

  function handleTouchEndZoom(e: ReactTouchEvent<HTMLDivElement>) {
    if (e.touches.length < 2) pinchRef.current = null
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

  function handleBlockContextMenu(parcel: Parcel) {
    return (e: ReactMouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (parcel.id == null) return
      setSelectedId(parcel.id)
    }
  }

  function setBlockRef(id: string | undefined) {
    return (el: HTMLDivElement | null) => {
      if (id == null) return
      if (el) blockRefs.current.set(id, el)
      else blockRefs.current.delete(id)
    }
  }

  // Repositionne le menu contextuel a chaque (re)selection, sur la tuile visee.
  useLayoutEffect(() => {
    if (selectedId == null) {
      setMenuPos(null)
      return
    }
    const el = blockRefs.current.get(selectedId)
    if (!el) {
      setMenuPos(null)
      return
    }
    setMenuPos(computeMenuPosition(el.getBoundingClientRect()))
  }, [selectedId])

  // Un tap/clic en dehors de toute tuile et du menu ferme la selection. Un tap sur une
  // autre tuile est deja gere par son propre mousedown/mouseup (re-selection), on ne
  // touche donc pas a ce cas ici pour eviter un flash de fermeture/reouverture.
  useEffect(() => {
    if (selectedId == null) return
    function handleOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      for (const el of blockRefs.current.values()) {
        if (el.contains(target)) return
      }
      setSelectedId(null)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [selectedId])

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold text-green-800">Carte du jardin</h1>
      <p className="text-sm text-gray-500">
        Glisse pour déplacer · Tape/clique pour ouvrir le menu d'actions (clic droit aussi) · Coin
        bas-droit pour redimensionner
      </p>

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Échelle : 1 case = {scale.toFixed(2)}m</span>
        {SCALE_STEPS.map((s) => (
          <button
            key={s}
            type="button"
            aria-label={`Échelle ${s}m par case`}
            onClick={() => setScale(s)}
            className={`rounded border px-2 py-1 text-sm ${
              Math.abs(scale - s) < 0.001
                ? 'border-green-600 bg-green-600 text-white'
                : 'border-green-300 text-green-700'
            }`}
          >
            {s}m
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-400">
        Pince à deux doigts pour zoomer/dézoomer · Ctrl/Cmd + molette (trackpad) sur ordinateur
      </p>

      <div
        className="overflow-auto rounded-lg border border-green-200"
        onWheel={handleWheelZoom}
        onTouchStart={handleTouchStartZoom}
        onTouchMove={handleTouchMoveZoom}
        onTouchEnd={handleTouchEndZoom}
      >
        <div className="flex">
          <div style={{ width: 28, flexShrink: 0 }} />
          <div className="flex shrink-0" style={{ width: gridWidthPx }}>
            {Array.from({ length: gridCols + 1 }, (_, i) => (
              <div
                key={i}
                className="shrink-0 border-l border-green-200 text-[10px] text-gray-400"
                style={{ width: i === gridCols ? 0 : CELL_PX }}
              >
                {i % 5 === 0 ? `${(i * scale).toFixed(scale < 1 ? 2 : 0)}m` : ''}
              </div>
            ))}
          </div>
        </div>
        <div className="flex">
          <div className="flex shrink-0 flex-col" style={{ width: 28, flexShrink: 0 }}>
            {Array.from({ length: gridRows + 1 }, (_, i) => (
              <div
                key={i}
                className="shrink-0 border-t border-green-200 text-[10px] text-gray-400"
                style={{ height: i === gridRows ? 0 : CELL_PX }}
              >
                {i % 5 === 0 ? `${(i * scale).toFixed(scale < 1 ? 2 : 0)}m` : ''}
              </div>
            ))}
          </div>
          <div
            data-testid="garden-map-grid"
            onMouseMove={handleGridPointerMove}
            onMouseUp={handleGridPointerUp}
            onMouseLeave={handleGridPointerUp}
            className="relative shrink-0"
            style={{
              width: gridWidthPx,
              height: gridHeightPx,
              backgroundColor: 'rgb(240,253,244)',
            }}
          >
            <svg
              className="pointer-events-none absolute inset-0"
              width={gridWidthPx}
              height={gridHeightPx}
            >
              {Array.from({ length: gridCols + 1 }, (_, i) => (
                <line
                  key={`v${i}`}
                  x1={i * CELL_PX}
                  y1={0}
                  x2={i * CELL_PX}
                  y2={gridHeightPx}
                  stroke="rgba(21,128,61,0.5)"
                  strokeWidth={1}
                />
              ))}
              {Array.from({ length: gridRows + 1 }, (_, i) => (
                <line
                  key={`h${i}`}
                  x1={0}
                  y1={i * CELL_PX}
                  x2={gridWidthPx}
                  y2={i * CELL_PX}
                  stroke="rgba(21,128,61,0.5)"
                  strokeWidth={1}
                />
              ))}
            </svg>
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
                ref={setBlockRef(p.id)}
                data-testid={`map-block-${p.id}`}
                onMouseDown={handleBlockPointerDown(p)}
                onContextMenu={handleBlockContextMenu(p)}
                className="absolute flex select-none flex-col items-center justify-center rounded-md border-2 text-center text-xs font-semibold text-gray-900 shadow-sm"
                style={{
                  left: cell(x),
                  top: cell(y),
                  width: cell(w),
                  height: cell(h),
                  backgroundColor: colorFor(p.id),
                  borderColor: isSelected ? 'rgb(21 128 61)' : 'rgba(21,128,61,0.6)',
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
                <span className="px-1 text-[10px] font-normal text-gray-700">
                  {w.toFixed(w < 1 ? 2 : 1)}m × {h.toFixed(h < 1 ? 2 : 1)}m
                </span>

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
      </div>

      {selectedId != null &&
        menuPos != null &&
        (() => {
          const parcel = placed.find((p) => p.id === selectedId)
          if (!parcel) return null
          return (
            <div
              ref={menuRef}
              data-testid="parcel-context-menu"
              className="fixed z-50 flex w-[180px] flex-col gap-1 rounded-lg border border-green-200 bg-white p-2 shadow-lg"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              <button
                type="button"
                onClick={() => rotateParcel(parcel)}
                className="rounded px-3 py-2 text-left text-sm text-green-700 hover:bg-green-50"
              >
                Rotation
              </button>
              <button
                type="button"
                onClick={() => startRename(parcel)}
                className="rounded px-3 py-2 text-left text-sm text-green-700 hover:bg-green-50"
              >
                Renommer
              </button>
              <button
                type="button"
                onClick={() => duplicateParcel(parcel)}
                className="rounded px-3 py-2 text-left text-sm text-green-700 hover:bg-green-50"
              >
                Dupliquer
              </button>
              <button
                type="button"
                onClick={() => waterParcel(parcel)}
                className="rounded bg-green-600 px-3 py-2 text-left text-sm text-white hover:bg-green-700"
              >
                Arroser
              </button>
              <button
                type="button"
                onClick={() => deleteParcel(parcel)}
                className="rounded px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
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
