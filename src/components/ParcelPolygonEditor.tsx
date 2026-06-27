import { useState } from 'react'
import type { MouseEvent } from 'react'

interface Point {
  x: number
  y: number
}

interface ParcelPolygonEditorProps {
  photoUrl: string
  onValidate: (polygon: Point[]) => void
  onCancel: () => void
}

export function ParcelPolygonEditor({ photoUrl, onValidate, onCancel }: ParcelPolygonEditorProps) {
  const [points, setPoints] = useState<Point[]>([])

  function handleClick(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    setPoints([...points, { x, y }])
  }

  function validate() {
    if (points.length >= 3) onValidate(points)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <img src={photoUrl} alt="Photo de la parcelle" className="w-full rounded-lg" />
        <svg
          data-testid="polygon-surface"
          onClick={handleClick}
          className="absolute inset-0 size-full"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          {points.length > 1 && (
            <polyline
              points={points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="rgb(34 197 94)"
              strokeWidth={0.006}
            />
          )}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={0.01} fill="rgb(34 197 94)" />
          ))}
        </svg>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPoints([])}
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
