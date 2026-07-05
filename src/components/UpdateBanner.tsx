import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  fetchPublishedVersion,
  isUpdateAvailable,
  type PublishedVersion,
} from '../services/versionService'

const CHECK_INTERVAL_MS = 5 * 60 * 1000

/**
 * Pastille flottante « Nouvelle version disponible ». Vérifie version.json au
 * chargement, toutes les 5 minutes et à chaque retour au premier plan (PWA posée
 * sur l'écran d'accueil). Invisible si l'app est à jour ou hors-ligne. Le clic
 * force la mise à jour du service worker puis recharge : le HTML étant servi en
 * NetworkFirst, le rechargement récupère la dernière version.
 */
export function UpdateBanner() {
  const [published, setPublished] = useState<PublishedVersion | null>(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      const version = await fetchPublishedVersion()
      if (!cancelled && version !== null) setPublished(version)
    }
    void check()
    const timer = setInterval(() => void check(), CHECK_INTERVAL_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  const applyUpdate = useCallback(async () => {
    setUpdating(true)
    try {
      const registration = await navigator.serviceWorker?.getRegistration()
      await registration?.update()
    } catch {
      // Peu importe : le rechargement suffit, le HTML est servi en NetworkFirst.
    }
    window.location.reload()
  }, [])

  if (!isUpdateAvailable(published)) return null

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-6"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <button
        type="button"
        onClick={() => void applyUpdate()}
        disabled={updating}
        className="pointer-events-auto flex items-center gap-2 rounded-full bg-green-700 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition active:scale-95 disabled:opacity-70"
      >
        <RefreshCw className={updating ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden />
        {updating ? 'Mise à jour…' : 'Nouvelle version · Mettre à jour'}
      </button>
    </div>
  )
}
