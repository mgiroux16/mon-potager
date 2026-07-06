import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './registerServiceWorker'

// Nettoyage post-demontage de la synchro maison (Lot 5) : les curseurs sync:lastAt:*
// ne sont plus lus ni ecrits par personne, on les purge une bonne fois pour ne pas
// les laisser trainer indefiniment dans localStorage.
for (const key of Object.keys(localStorage)) {
  if (key.startsWith('sync:lastAt:')) localStorage.removeItem(key)
}

// En dev, purger tout service worker laissé par une session précédente :
// un SW de dev peut servir une coquille vide et provoquer une page blanche.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    if (regs.length > 0) {
      Promise.all(regs.map((r) => r.unregister()))
        .then(() => caches?.keys?.())
        .then((keys) => Promise.all((keys ?? []).map((k) => caches.delete(k))))
        .then(() => window.location.reload())
    }
  })
}

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
