import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Camera, X } from 'lucide-react'
import { compressImage } from '../services/imageService'

interface PhotoInputProps {
  photos: string[]
  onChange: (photos: string[]) => void
  max?: number
}

// Capture de photos optionnelle pour un formulaire d'entrée. Compresse chaque
// fichier choisi en data URL JPEG (via le service), affiche les vignettes et
// permet la suppression. L'input fichier `capture="environment"` ouvre l'appareil
// photo arrière sur mobile, et reste un sélecteur de fichier classique sur desktop.
export function PhotoInput({ photos, onChange, max = 3 }: PhotoInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function handleSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const dataUrl = await compressImage(file)
      onChange([...photos, dataUrl])
    } finally {
      setBusy(false)
    }
  }

  function removeAt(index: number) {
    onChange(photos.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-green-800">Photos (optionnel)</span>
      <div className="flex flex-wrap gap-2">
        {photos.map((url, index) => (
          <div key={url} className="relative size-20 overflow-hidden rounded-lg border border-green-200">
            <img src={url} alt={`Photo ${index + 1}`} className="size-full object-cover" />
            <button
              type="button"
              aria-label={`Supprimer la photo ${index + 1}`}
              onClick={() => removeAt(index)}
              className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/55 text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {photos.length < max && (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="grid size-20 place-items-center rounded-lg border border-dashed border-green-300 text-green-600 disabled:opacity-50"
            >
              <Camera className="size-6" />
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              aria-label="Ajouter une photo"
              onChange={handleSelect}
              className="hidden"
            />
          </>
        )}
      </div>
    </div>
  )
}
