import { useState } from 'react'
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'
import { TERRAIN_OUTLINE } from '../data/terrainShape'

interface Point {
  x: number
  y: number
}

interface ZoneShapeEditorProps {
  onValidate: (polygon: Point[]) => void
  onCancel: () => void
}

const TEMPLATES: Record<'rectangle' | 'carre' | 'triangle', Point[]> = {
  rectangle: [
    { x: 0.3, y: 0.3 },
    { x: 0.7, y: 0.3 },
    { x: 0.7, y: 0.5 },
    { x: 0.3, y: 0.5 },
  ],
  carre: [
    { x: 0.35, y: 0.3 },
    { x: 0.65, y: 0.3 },
    { x: 0.65, y: 0.6 },
    { x: 0.35, y: 0.6 },
  ],
  triangle: [
    { x: 0.5, y: 0.25 },
    { x: 0.7, y: 0.55 },
    { x: 0.3, y: 0.55 },
  ],
}

export function ZoneShapeEditor({ onValidate, onCancel }: ZoneShapeEditorProps) {
  const [points, setPoints] = useState<Point[]>([])
  const [freeDraw, setFreeDraw] = useState(false)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)

  function relativePoint(e: { clientX: number; clientY: number }, rect: DOMRect): Point {
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    }
  }

  function applyTemplate(template: keyof typeof TEMPLATES) {
    setFreeDraw(false)
    setPoints(TEMPLATES[template])
  }

  function startFreeDraw() {
    setFreeDraw(true)
    setPoints([])
  }

  function handleSurfaceClick(e: ReactMouseEvent<SVGSVGElement>) {
    if (!freeDraw || draggingIndex != null) return
    const rect = e.currentTarget.getBoundingClientRect()
    setPoints([...points, relativePoint(e, rect)])
  }

  function handlePointerDownOnPoint(index: number) {
    return (e: ReactPointerEvent<SVGCircleElement>) => {
      e.stopPropagation()
      setDraggingIndex(index)
    }
  }

  function handleSurfacePointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (draggingIndex == null) return
    const rect = e.currentTarget.getBoundingClientRect()
    const next = relativePoint(e, rect)
    setPoints((prev) => prev.map((p, i) => (i === draggingIndex ? next : p)))
  }

  function handleSurfacePointerUp() {
    setDraggingIndex(null)
  }

  function reset() {
    setPoints([])
    setFreeDraw(false)
  }

  function validate() {
    if (points.length >= 3) onValidate(points)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <svg
          data-testid="zone-shape-surface"
          onClick={handleSurfaceClick}
          onPointerMove={handleSurfacePointerMove}
          onPointerUp={handleSurfacePointerUp}
          className="w-full rounded-lg bg-green-50"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          <polygon
            points={TERRAIN_OUTLINE.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="rgb(220 252 231)"
            stroke="rgb(34 197 94)"
            strokeWidth={0.004}
          />
          {points.length > 1 && (
            <polygon
              points={points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(59,130,246,0.25)"
              stroke="rgb(59 130 246)"
              strokeWidth={0.006}
            />
          )}
          {points.map((p, i) => (
            <circle
              key={i}
              data-testid={`zone-point-${i}`}
              cx={p.x}
              cy={p.y}
              r={0.015}
              fill="rgb(59 130 246)"
              onPointerDown={handlePointerDownOnPoint(i)}
              style={{ cursor: 'grab' }}
            />
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => applyTemplate('rectangle')}
          className="rounded-lg border border-green-300 px-3 py-2 text-sm text-green-700"
        >
          Rectangle
        </button>
        <button
          type="button"
          onClick={() => applyTemplate('carre')}
          className="rounded-lg border border-green-300 px-3 py-2 text-sm text-green-700"
        >
          Carré
        </button>
        <button
          type="button"
          onClick={() => applyTemplate('triangle')}
          className="rounded-lg border border-green-300 px-3 py-2 text-sm text-green-700"
        >
          Triangle
        </button>
        <button
          type="button"
          onClick={startFreeDraw}
          className="rounded-lg border border-green-300 px-3 py-2 text-sm text-green-700"
        >
          Forme libre
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-green-300 px-3 py-2 text-sm text-green-700"
        >
          Recommencer
        </button>
        <button
          type="button"
          onClick={validate}
          disabled={points.length < 3}
          className="rounded-lg bg-green-600 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Valider la forme
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
