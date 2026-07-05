// Version publiée de l'app : lue depuis version.json, écrit à la racine du build
// par vite.config.ts (plugin version-json). C'est la référence « dernière version
// qui doit tourner », comparée au hash embarqué dans le bundle (__APP_BUILD_HASH__).

export interface PublishedVersion {
  hash: string
  builtAt: string
}

// Contourne tous les caches (HTTP, CDN GitHub Pages, service worker) : le paramètre
// horodaté évite une réponse rassie, cache: no-store évite d'en créer une nouvelle.
// version.json n'est ni précaché ni couvert par une route runtime du SW (voir
// globPatterns dans vite.config.ts), il part donc toujours sur le réseau.
export async function fetchPublishedVersion(): Promise<PublishedVersion | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as Partial<PublishedVersion>
    if (typeof data.hash !== 'string' || data.hash.length === 0) return null
    return { hash: data.hash, builtAt: typeof data.builtAt === 'string' ? data.builtAt : '' }
  } catch {
    // Hors-ligne ou réponse invalide : pas d'info, donc pas de bannière.
    return null
  }
}

export function isUpdateAvailable(published: PublishedVersion | null): boolean {
  return published !== null && published.hash !== __APP_BUILD_HASH__
}
