import { useState } from 'react'

// Vignettes des photos d'une entrée de journal, avec agrandissement plein écran
// au clic et fermeture au clic sur l'overlay.
export function PhotoThumbs({ urls }: { urls: string[] }) {
  const [active, setActive] = useState<string | null>(null)
  if (urls.length === 0) return null

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {urls.map((url, index) => (
        <button
          key={url}
          type="button"
          aria-label={`Agrandir la photo ${index + 1}`}
          onClick={() => setActive(url)}
          className="size-12 overflow-hidden rounded-md border border-green-200"
        >
          <img src={url} alt={`Photo ${index + 1}`} className="size-full object-cover" />
        </button>
      ))}
      {active && (
        <div
          role="dialog"
          aria-label="Photo agrandie"
          onClick={() => setActive(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
        >
          <img src={active} alt="Photo agrandie" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  )
}
